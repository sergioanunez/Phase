import { prisma } from "@/lib/prisma"
import { addWorkingDays, subWorkingDays, diffWorkingDays, normalizeToWorkingDay } from "@/lib/working-days"
import {
  buildTaskMap,
  computeFrontierTasks,
  computeBlockingFocusTask,
  pickNextExecutionTask,
  type FlowTaskForSelection,
} from "./selection"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"
import type { FlowAction, ComputeFlowInput, ComputeFlowResult } from "./types"

const COMPLETED = "Completed"
const IN_PROGRESS = "InProgress"
const CANCELED = "Canceled"

type TaskStatus = string

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseDate(s: string): Date {
  const d = new Date(s)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Get home IDs the user can see: Superintendent = assigned, Manager/Admin = all company. */
async function getHomeIdsForUser(companyId: string, userId: string, role: string): Promise<string[]> {
  if (role === "Superintendent") {
    const assignments = await prisma.homeAssignment.findMany({
      where: { companyId, superintendentUserId: userId },
      select: { homeId: true },
    })
    return assignments.map((a) => a.homeId)
  }
  const homes = await prisma.home.findMany({
    where: { companyId },
    select: { id: true },
  })
  return homes.map((h) => h.id)
}

/** Detect template IDs that participate in a cycle (DFS cycle detection on template graph). Exported for tests. */
export function detectCircularTemplateIds(
  templateIds: string[],
  depEdges: Array<{ templateItemId: string; dependsOnItemId: string }>
): Set<string> {
  const outEdges: Record<string, string[]> = {}
  for (const id of templateIds) {
    outEdges[id] = []
  }
  for (const e of depEdges) {
    if (templateIds.includes(e.templateItemId) && templateIds.includes(e.dependsOnItemId)) {
      outEdges[e.templateItemId].push(e.dependsOnItemId)
    }
  }
  const cyclic = new Set<string>()
  const visited = new Set<string>()
  const stack = new Set<string>()

  function visit(id: string): boolean {
    if (stack.has(id)) {
      cyclic.add(id)
      return true
    }
    if (visited.has(id)) return false
    visited.add(id)
    stack.add(id)
    for (const next of outEdges[id] ?? []) {
      if (visit(next)) cyclic.add(id)
    }
    stack.delete(id)
    return false
  }
  for (const id of templateIds) {
    if (!visited.has(id)) visit(id)
  }
  // Expand: any node that can reach a cyclic node is in the cycle
  const inCyclic = new Set(cyclic)
  let changed = true
  while (changed) {
    changed = false
    for (const e of depEdges) {
      if (inCyclic.has(e.templateItemId) && !inCyclic.has(e.dependsOnItemId)) {
        inCyclic.add(e.dependsOnItemId)
        changed = true
      }
    }
  }
  return inCyclic
}

export async function computeFlow(input: ComputeFlowInput): Promise<ComputeFlowResult> {
  const { companyId, userId, role, scope = "today", filter = "all", search } = input
  const homeIds = await getHomeIdsForUser(companyId, userId, role)
  if (homeIds.length === 0) {
    return { actions: [] }
  }

  const today = toDateOnly(new Date())
  const todayDate = parseDate(today)

  const templateDeps = await prisma.templateDependency.findMany({
    where: {
      OR: [{ companyId }, { companyId: null }],
    },
    select: { templateItemId: true, dependsOnItemId: true },
  })

  const allTemplateIds = await prisma.workTemplateItem
    .findMany({ where: { OR: [{ companyId }, { companyId: null }] }, select: { id: true } })
    .then((r) => r.map((t) => t.id))
  const circularTemplateIds = detectCircularTemplateIds(allTemplateIds, templateDeps)
  const circularWarning =
    circularTemplateIds.size > 0
      ? "Some tasks have circular dependencies and were excluded. Fix in Templates."
      : undefined

  const homes = await prisma.home.findMany({
    where: { id: { in: homeIds } },
    include: {
      subdivision: { select: { name: true } },
      tasks: {
        include: {
          templateItem: {
            include: {
              contractor: { select: { companyName: true, leadDays: true } },
              dependencies: { select: { dependsOnItemId: true } },
            },
          },
          contractor: { select: { companyName: true } },
        },
        orderBy: [...homeTaskOrderByTemplateSequence()],
      },
    },
  })

  const actions: FlowAction[] = []

  for (const home of homes) {
    const tasks = home.tasks.filter(
      (t) => t.templateItem && !circularTemplateIds.has(t.templateItemId)
    )
    if (tasks.length === 0) continue

    let homeStartDate: Date
    if (home.startDate) {
      homeStartDate = new Date(home.startDate)
      homeStartDate.setHours(0, 0, 0, 0)
    } else {
      const scheduledDates = tasks
        .map((t) => t.scheduledDate)
        .filter((d): d is NonNullable<typeof d> => d != null)
      if (scheduledDates.length > 0) {
        const earliest = new Date(Math.min(...scheduledDates.map((d) => d.getTime())))
        earliest.setHours(0, 0, 0, 0)
        homeStartDate = earliest
      } else {
        homeStartDate = new Date(home.createdAt)
        homeStartDate.setHours(0, 0, 0, 0)
      }
    }
    // Ensure base forecast start for this home is always a working day (Mon–Fri)
    homeStartDate = normalizeToWorkingDay(homeStartDate)

    const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]))
    const predecessors: Record<string, string[]> = {}
    for (const t of tasks) {
      predecessors[t.id] = []
    }
    for (const dep of templateDeps) {
      const dependent = tasks.find((x) => x.templateItemId === dep.templateItemId)
      const prereq = tasks.find((x) => x.templateItemId === dep.dependsOnItemId)
      if (dependent && prereq) {
        predecessors[dependent.id].push(prereq.id)
      }
    }

    const forecastStart: Record<string, Date> = {}
    const forecastFinish: Record<string, Date> = {}

    const topoOrder: string[] = []
    const inDegree: Record<string, number> = {}
    const successors: Record<string, string[]> = {}
    for (const t of tasks) {
      inDegree[t.id] = predecessors[t.id].length
      successors[t.id] = tasks.filter((p) => predecessors[p.id].includes(t.id)).map((p) => p.id)
    }
    const queue: string[] = tasks.filter((t) => inDegree[t.id] === 0).map((t) => t.id)
    while (queue.length > 0) {
      const id = queue.shift()!
      topoOrder.push(id)
      for (const succId of successors[id] ?? []) {
        inDegree[succId] -= 1
        if (inDegree[succId] === 0) queue.push(succId)
      }
    }

    for (const taskId of topoOrder) {
      const task = taskById[taskId]
      if (!task) continue
      const preds = predecessors[taskId]
      const duration = Math.max(0, task.durationDaysSnapshot)
      if (preds.length === 0) {
        forecastStart[taskId] = homeStartDate
      } else {
        const maxFinish = preds.reduce((max, p) => {
          const f = forecastFinish[p]
          return !f ? max : !max ? f : f > max ? f : max
        }, null as Date | null)
        forecastStart[taskId] = maxFinish ?? homeStartDate
      }
      forecastFinish[taskId] = addWorkingDays(forecastStart[taskId], duration)
    }

    const forecastCompletionDate =
      tasks.length === 0
        ? homeStartDate
        : new Date(
            Math.max(...tasks.map((t) => forecastFinish[t.id]?.getTime() ?? 0))
          )
    const targetDate = home.targetCompletionDate
      ? new Date(home.targetCompletionDate)
      : null
    const slackWorkingDays =
      targetDate != null
        ? diffWorkingDays(forecastCompletionDate, targetDate)
        : undefined

    const address = home.addressOrLot
    const subdivisionName = home.subdivision?.name ?? ""
    const scheduledCount = tasks.filter((t) => t.scheduledDate != null).length
    const notStarted = !home.startDate || scheduledCount === 0

    const selectionTasks: FlowTaskForSelection[] = tasks.map((t) => ({
      id: t.id,
      status: t.status,
      scheduledDate: t.scheduledDate,
      forecastStart: forecastStart[t.id],
      sortOrderSnapshot: t.sortOrderSnapshot,
      templateSequenceOrder: t.templateItem?.sequenceOrder ?? null,
    }))
    const taskMap = buildTaskMap(selectionTasks)
    const getDependencyIds = (taskId: string) => predecessors[taskId] ?? []

    // Planning selection: show prep/scheduling actions even when execution is blocked
    // by unfinished predecessors. ExecutionEligible still requires all predecessors Completed.
    const duePrepCandidates = selectionTasks
      .map((sel) => {
        const task = taskById[sel.id]
        const template = task?.templateItem
        if (!task || !template) return null

        const status = task.status as TaskStatus
        // In-progress tasks should still be handled by the execution branch below.
        if (status === IN_PROGRESS) return null

        const preds = predecessors[task.id] ?? []
        const fs = forecastStart[task.id]
        const ff = forecastFinish[task.id]
        if (!fs || !ff) return null

        const contractorLeadDays =
          template.contractorLeadOverrideDays != null
            ? template.contractorLeadOverrideDays
            : template.contractor?.leadDays ?? 0
        const materialLead = template.requiresOrdering ? (template.materialLeadDays ?? 0) : 0
        const prepLeadDays = Math.max(contractorLeadDays, materialLead)
        const leadTimeSource: "contractor" | "override" | "unassigned" =
          template.contractorLeadOverrideDays != null
            ? "override"
            : template.contractorId
              ? "contractor"
              : "unassigned"

        const prepStart = subWorkingDays(fs, prepLeadDays)
        const prepStartStr = toDateOnly(prepStart)
        const forecastStartStr = toDateOnly(fs)
        const forecastFinishStr = toDateOnly(ff)

        const showPrep =
          status !== COMPLETED && status !== CANCELED && prepStartStr <= today
        if (!showPrep) return null

        const executionEligible =
          preds.length === 0 || preds.every((p) => (taskById[p]?.status as TaskStatus) === COMPLETED)
        const predecessorReadyForScheduling =
          preds.length === 0 ||
          preds.every((p) => {
            const predTask = taskById[p]
            if (!predTask) return false
            const predStatus = predTask.status as TaskStatus
            return predStatus === COMPLETED || !!predTask.scheduledDate
          })

        // Only surface "schedule now" actions when execution is blocked.
        if (executionEligible || !predecessorReadyForScheduling) return null

        const dependencyStatus = preds.map((p) => ({
          name: taskById[p]?.nameSnapshot ?? "?",
          complete: (taskById[p]?.status as TaskStatus) === COMPLETED,
        }))

        const contractorName =
          template.contractor?.companyName ?? task.contractor?.companyName ?? undefined

        return {
          task,
          template,
          preds,
          fs,
          ff,
          prepStartStr,
          forecastStartStr,
          forecastFinishStr,
          prepLeadDays,
          leadTimeSource,
          executionEligible,
          dependencyStatus,
          contractorName,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)

    const duePrepCandidate = duePrepCandidates.sort((a, b) => {
      const dateCmp = a.prepStartStr.localeCompare(b.prepStartStr)
      if (dateCmp !== 0) return dateCmp
      const sa = a.template.sequenceOrder
      const sb = b.template.sequenceOrder
      const aHas = sa != null
      const bHas = sb != null
      if (aHas && bHas && sa !== sb) return sa - sb
      if (aHas && !bHas) return -1
      if (!aHas && bHas) return 1
      if (a.task.sortOrderSnapshot !== b.task.sortOrderSnapshot) return a.task.sortOrderSnapshot - b.task.sortOrderSnapshot
      return a.task.nameSnapshot.localeCompare(b.task.nameSnapshot)
    })[0]

    const frontier = computeFrontierTasks(selectionTasks, taskMap, getDependencyIds, COMPLETED)
    const nextExecutionTask =
      frontier.length > 0 ? pickNextExecutionTask(frontier, forecastStart) : null

    if (duePrepCandidate) {
      const { task, template, prepStartStr, forecastStartStr, forecastFinishStr, prepLeadDays, leadTimeSource, executionEligible, dependencyStatus, contractorName } =
        duePrepCandidate

      actions.push({
        homeId: home.id,
        homeAddress: address,
        subdivisionName,
        taskId: template.id,
        taskInstanceId: task.id,
        taskName: task.nameSnapshot,
        contractorName,
        type: "PREP",
        actionDate: prepStartStr,
        forecastStart: forecastStartStr,
        forecastFinish: forecastFinishStr,
        prepStart: prepStartStr,
        prepLeadDays,
        leadTimeSource,
        executionEligible,
        requiresOrdering: template.requiresOrdering ?? false,
        isOverdue: prepStartStr < today,
        slackWorkingDays,
        sortOrderSnapshot: task.sortOrderSnapshot,
        templateSequenceOrder: template.sequenceOrder ?? null,
        dependencyStatus,
        state: executionEligible ? "READY" : "WAITING",
        actionLabel: executionEligible ? `Get ready: ${task.nameSnapshot}` : `Schedule now: ${task.nameSnapshot}`,
        actionCta: { type: "OPEN_TASK", taskId: task.id, homeId: home.id },
        notStarted,
      })
      continue
    }

    if (nextExecutionTask) {
      const task = taskById[nextExecutionTask.id]
      const template = task?.templateItem
      if (!task || !template) continue

      const status = task.status as TaskStatus
      const preds = predecessors[task.id]
      const contractorLeadDays =
        template.contractorLeadOverrideDays != null
          ? template.contractorLeadOverrideDays
          : template.contractor?.leadDays ?? 0
      const materialLead = template.requiresOrdering ? (template.materialLeadDays ?? 0) : 0
      const prepLeadDays = Math.max(contractorLeadDays, materialLead)
      const leadTimeSource: "contractor" | "override" | "unassigned" =
        template.contractorLeadOverrideDays != null
          ? "override"
          : template.contractorId
            ? "contractor"
            : "unassigned"
      const fs = forecastStart[task.id]
      const ff = forecastFinish[task.id]
      if (!fs || !ff) continue
      const prepStart = subWorkingDays(fs, prepLeadDays)
      const prepStartStr = toDateOnly(prepStart)
      const forecastStartStr = toDateOnly(fs)
      const forecastFinishStr = toDateOnly(ff)
      const contractorName =
        template.contractor?.companyName ?? task.contractor?.companyName ?? undefined
      const dependencyStatus = preds.map((p) => ({
        name: taskById[p]?.nameSnapshot ?? "?",
        complete: (taskById[p]?.status as TaskStatus) === COMPLETED,
      }))

      if (status === IN_PROGRESS) {
        const actionDate = forecastStartStr
        actions.push({
          homeId: home.id,
          homeAddress: address,
          subdivisionName,
          taskId: template.id,
          taskInstanceId: task.id,
          taskName: task.nameSnapshot,
          contractorName,
          type: "EXECUTE",
          actionDate,
          forecastStart: forecastStartStr,
          forecastFinish: forecastFinishStr,
          prepStart: prepStartStr,
          prepLeadDays,
          leadTimeSource,
          executionEligible: true,
          requiresOrdering: template.requiresOrdering ?? false,
          isOverdue: actionDate < today,
          slackWorkingDays,
          sortOrderSnapshot: task.sortOrderSnapshot,
          templateSequenceOrder: template.sequenceOrder ?? null,
          dependencyStatus,
          state: "IN_PROGRESS",
          actionLabel: `In progress: ${task.nameSnapshot}`,
          actionCta: { type: "OPEN_TASK", taskId: task.id, homeId: home.id },
          notStarted,
        })
        continue
      }

      const prepStartDateOnly = toDateOnly(prepStart)
      const showPrep =
        status !== COMPLETED &&
        status !== CANCELED &&
        prepStartDateOnly <= today

      if (showPrep) {
        const actionDate = prepStartStr
        actions.push({
          homeId: home.id,
          homeAddress: address,
          subdivisionName,
          taskId: template.id,
          taskInstanceId: task.id,
          taskName: task.nameSnapshot,
          contractorName,
          type: "PREP",
          actionDate,
          forecastStart: forecastStartStr,
          forecastFinish: forecastFinishStr,
          prepStart: prepStartStr,
          prepLeadDays,
          leadTimeSource,
          executionEligible: true,
          requiresOrdering: template.requiresOrdering ?? false,
          isOverdue: actionDate < today,
          slackWorkingDays,
          sortOrderSnapshot: task.sortOrderSnapshot,
          templateSequenceOrder: template.sequenceOrder ?? null,
          dependencyStatus,
          state: "READY",
          actionLabel: `Get ready: ${task.nameSnapshot}`,
          actionCta: { type: "OPEN_TASK", taskId: task.id, homeId: home.id },
          notStarted,
        })
      } else {
        const actionDate = forecastStartStr
        actions.push({
          homeId: home.id,
          homeAddress: address,
          subdivisionName,
          taskId: template.id,
          taskInstanceId: task.id,
          taskName: task.nameSnapshot,
          contractorName,
          type: "EXECUTE",
          actionDate,
          forecastStart: forecastStartStr,
          forecastFinish: forecastFinishStr,
          prepStart: prepStartStr,
          prepLeadDays,
          leadTimeSource,
          executionEligible: true,
          requiresOrdering: template.requiresOrdering ?? false,
          isOverdue: actionDate < today,
          slackWorkingDays,
          sortOrderSnapshot: task.sortOrderSnapshot,
          templateSequenceOrder: template.sequenceOrder ?? null,
          dependencyStatus,
          state: "READY",
          actionLabel: `Start work: ${task.nameSnapshot}`,
          actionCta: { type: "OPEN_TASK", taskId: task.id, homeId: home.id },
          notStarted,
        })
      }
      continue
    }

    const blocking = computeBlockingFocusTask(
      selectionTasks,
      taskMap,
      getDependencyIds,
      topoOrder,
      forecastStart,
      COMPLETED,
      IN_PROGRESS
    )
    if (blocking) {
      const task = taskById[blocking.id]
      const template = task?.templateItem
      if (!task || !template) continue

      const status = task.status as TaskStatus
      const preds = predecessors[task.id]
      const fs = forecastStart[task.id]
      const ff = forecastFinish[task.id]
      if (!fs || !ff) continue
      const contractorLeadDays =
        template.contractorLeadOverrideDays != null
          ? template.contractorLeadOverrideDays
          : template.contractor?.leadDays ?? 0
      const materialLead = template.requiresOrdering ? (template.materialLeadDays ?? 0) : 0
      const prepLeadDays = Math.max(contractorLeadDays, materialLead)
      const leadTimeSource: "contractor" | "override" | "unassigned" =
        template.contractorLeadOverrideDays != null
          ? "override"
          : template.contractorId
            ? "contractor"
            : "unassigned"
      const prepStartStr = toDateOnly(subWorkingDays(fs, prepLeadDays))
      const forecastStartStr = toDateOnly(fs)
      const forecastFinishStr = toDateOnly(ff)
      const contractorName =
        template.contractor?.companyName ?? task.contractor?.companyName ?? undefined
      const dependencyStatus = preds.map((p) => ({
        name: taskById[p]?.nameSnapshot ?? "?",
        complete: (taskById[p]?.status as TaskStatus) === COMPLETED,
      }))
      const actionDate = toDateOnly(fs)
      const isBlockingInProgress = status === IN_PROGRESS
      const predecessorReadyForScheduling =
        preds.length === 0 ||
        preds.every((p) => {
          const predTask = taskById[p]
          if (!predTask) return false
          const predStatus = predTask.status as TaskStatus
          return predStatus === COMPLETED || !!predTask.scheduledDate
        })

      // Middle-ground behavior: don't show "schedule now" style blocked cards
      // when predecessors are not even scheduled yet.
      if (!isBlockingInProgress && !predecessorReadyForScheduling) {
        continue
      }

      actions.push({
        homeId: home.id,
        homeAddress: address,
        subdivisionName,
        taskId: template.id,
        taskInstanceId: task.id,
        taskName: task.nameSnapshot,
        contractorName,
        type: "EXECUTE",
        actionDate,
        forecastStart: forecastStartStr,
        forecastFinish: forecastFinishStr,
        prepStart: prepStartStr,
        prepLeadDays,
        leadTimeSource,
        executionEligible: false,
        requiresOrdering: template.requiresOrdering ?? false,
        isOverdue: actionDate < today,
        slackWorkingDays,
        sortOrderSnapshot: task.sortOrderSnapshot,
        templateSequenceOrder: template.sequenceOrder ?? null,
        dependencyStatus,
        state: isBlockingInProgress ? "IN_PROGRESS" : "WAITING",
        actionLabel: isBlockingInProgress
          ? `In progress: ${task.nameSnapshot}`
          : `Schedule now: ${task.nameSnapshot}`,
        actionCta: { type: "OPEN_HOME_TASKS", taskId: task.id, homeId: home.id },
        notStarted,
      })
    }
  }

  let filtered = actions

  if (search?.trim()) {
    const q = search.trim().toLowerCase()
    filtered = filtered.filter(
      (a) =>
        a.homeAddress.toLowerCase().includes(q) ||
        a.taskName.toLowerCase().includes(q) ||
        (a.contractorName?.toLowerCase().includes(q) ?? false) ||
        a.subdivisionName.toLowerCase().includes(q)
    )
  }

  if (filter === "prep") {
    filtered = filtered.filter((a) => a.type === "PREP")
  } else if (filter === "execute") {
    filtered = filtered.filter((a) => a.type === "EXECUTE")
  }

  // Single unified \"today\" view:
  // - include tasks whose actionDate is today or earlier
  // - overdue items are always included (they have actionDate < today and isOverdue = true)
  filtered = filtered.filter((a) => a.actionDate <= today)

  filtered.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    if (a.actionDate !== b.actionDate) return a.actionDate.localeCompare(b.actionDate)
    const slackA = a.slackWorkingDays ?? 999999
    const slackB = b.slackWorkingDays ?? 999999
    if (slackA !== slackB) return slackA - slackB
    const sa = a.templateSequenceOrder
    const sb = b.templateSequenceOrder
    const aHas = sa != null
    const bHas = sb != null
    if (aHas && bHas && sa !== sb) return sa - sb
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (a.sortOrderSnapshot !== b.sortOrderSnapshot) return a.sortOrderSnapshot - b.sortOrderSnapshot
    return a.taskName.localeCompare(b.taskName)
  })

  return { actions: filtered, circularWarning }
}
