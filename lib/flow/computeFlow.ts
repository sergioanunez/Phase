import { prisma } from "@/lib/prisma"
import { subWorkingDays, diffWorkingDays, normalizeToWorkingDay, taskFinishFromDuration } from "@/lib/working-days"
import {
  buildTaskMap,
  pickNextCriticalUnscheduledTask,
  computeFlowUrgency,
  compareFlowUrgency,
  type FlowTaskForSelection,
} from "./selection"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"
import { homeOrderByDisplayOrder } from "@/lib/homes/display-order"
import type { FlowAction, ComputeFlowInput, ComputeFlowResult } from "./types"
import { isExcludedFromActiveWork, isTaskResolvedForScheduling } from "@/lib/task-status"
import { isHomeConstructionStarted } from "@/lib/schedule-status"

const COMPLETED = "Completed"
const NOT_APPLICABLE = "NotApplicable"

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
  const { companyId, userId, role, search } = input
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
    orderBy: [...homeOrderByDisplayOrder],
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
      const duration =
        task.status === NOT_APPLICABLE || task.status === COMPLETED
          ? 0
          : Math.max(0, task.durationDaysSnapshot)
      if (preds.length === 0) {
        forecastStart[taskId] = homeStartDate
      } else {
        const maxFinish = preds.reduce((max, p) => {
          const f = forecastFinish[p]
          return !f ? max : !max ? f : f > max ? f : max
        }, null as Date | null)
        forecastStart[taskId] = maxFinish ?? homeStartDate
      }
      forecastFinish[taskId] = taskFinishFromDuration(forecastStart[taskId], duration)
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
    const notStarted = !isHomeConstructionStarted(home.startDate, scheduledCount)

    const selectionTasks: FlowTaskForSelection[] = tasks.map((t) => ({
      id: t.id,
      status: t.status,
      scheduledDate: t.scheduledDate,
      forecastStart: forecastStart[t.id],
      sortOrderSnapshot: t.sortOrderSnapshot,
      templateSequenceOrder: t.templateItem?.sequenceOrder ?? null,
      isCritical: !!(t.isCriticalPath || t.templateItem?.isCriticalGate),
    }))
    const taskMap = buildTaskMap(selectionTasks)
    const getDependencyIds = (taskId: string) => predecessors[taskId] ?? []

    const nextCritical = pickNextCriticalUnscheduledTask(
      selectionTasks,
      topoOrder,
      taskMap,
      getDependencyIds,
      forecastStart
    )
    if (!nextCritical) continue

    const task = taskById[nextCritical.id]
    const template = task?.templateItem
    if (!task || !template) continue

    const status = task.status as TaskStatus
    if (isExcludedFromActiveWork(status)) continue

    const preds = predecessors[task.id] ?? []
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
    const prepStart = subWorkingDays(fs, prepLeadDays)
    const prepStartStr = toDateOnly(prepStart)
    const forecastStartStr = toDateOnly(fs)
    const forecastFinishStr = toDateOnly(ff)
    const contractorName =
      template.contractor?.companyName ?? task.contractor?.companyName ?? undefined
    const dependencyStatus = preds.map((p) => ({
      name: taskById[p]?.nameSnapshot ?? "?",
      complete: isTaskResolvedForScheduling(taskById[p]?.status as TaskStatus),
    }))

    const urgency = computeFlowUrgency({
      forecastStart: fs,
      today: todayDate,
      slackWorkingDays,
    })
    const actionDate = forecastStartStr

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
      isOverdue: urgency === "OVERDUE",
      urgency,
      slackWorkingDays,
      sortOrderSnapshot: task.sortOrderSnapshot,
      templateSequenceOrder: template.sequenceOrder ?? null,
      dependencyStatus,
      state: "READY",
      actionLabel: `Schedule ${task.nameSnapshot}`,
      actionCta: { type: "OPEN_SCHEDULE_MODAL", taskId: task.id, homeId: home.id },
      notStarted,
    })
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

  filtered.sort((a, b) => {
    const urgencyCmp = compareFlowUrgency(a, b)
    if (urgencyCmp !== 0) return urgencyCmp
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
