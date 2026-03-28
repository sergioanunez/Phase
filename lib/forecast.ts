/**
 * Deterministic CPM (Critical Path Method) forecast using real execution data
 * and dependency logic. All duration math is in WORKING DAYS (Mon–Fri).
 */

import { addWorkingDays, normalizeToWorkingDay, workingDaysBetween } from "./working-days"

// Re-export for consumers
export { addWorkingDays, normalizeToWorkingDay, workingDaysBetween } from "./working-days"

export type TaskStatusForForecast = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE"

export type TaskNode = {
  id: string
  name?: string
  durationDays: number
  status: TaskStatusForForecast
  dependencyIds: string[]
  scheduledStartDate?: Date | null
  scheduledEndDate?: Date | null
  completedAt?: Date | null
}

export type ForecastResult = {
  forecastDate: Date
  forecastDateISO: string
  criticalPathTaskIds: string[]
  warnings: string[]
  /** Per-task early start/finish (for persistence) */
  taskEarlyStart?: Record<string, Date>
  taskEarlyFinish?: Record<string, Date>
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * Topological sort with cycle detection. Returns ordered tasks and any cycle/warnings.
 */
export function topologicalSort(tasks: TaskNode[]): {
  order: TaskNode[]
  cycleTaskIds: string[]
  warnings: string[]
} {
  const idToTask = new Map(tasks.map((t) => [t.id, t]))
  const warnings: string[] = []
  const cycleTaskIds: string[] = []

  const inDegree: Record<string, number> = {}
  const successors: Record<string, string[]> = {}
  for (const t of tasks) {
    inDegree[t.id] = 0
    successors[t.id] = []
  }
  for (const t of tasks) {
    for (const depId of t.dependencyIds) {
      if (idToTask.has(depId)) {
        successors[depId].push(t.id)
        inDegree[t.id] += 1
      }
    }
  }

  const queue: string[] = tasks.filter((t) => inDegree[t.id] === 0).map((t) => t.id)
  const orderIds: string[] = []

  while (queue.length > 0) {
    const id = queue.shift()!
    orderIds.push(id)
    for (const succId of successors[id]) {
      inDegree[succId] -= 1
      if (inDegree[succId] === 0) queue.push(succId)
    }
  }

  if (orderIds.length !== tasks.length) {
    const inCycle = tasks.filter((t) => !orderIds.includes(t.id)).map((t) => t.id)
    cycleTaskIds.push(...inCycle)
    warnings.push(`Dependency cycle detected involving tasks: ${inCycle.join(", ")}`)
  }

  const order = orderIds
    .map((id) => idToTask.get(id))
    .filter((t): t is TaskNode => t != null)

  return { order, cycleTaskIds, warnings }
}

const COMPLETE: TaskStatusForForecast = "COMPLETE"

/**
 * Compute home forecast using CPM with real execution (completedAt) and dependencies.
 * - COMPLETE tasks with completedAt use that as actual finish; missing completedAt uses scheduledEndDate ?? fallbackDate and adds a warning.
 * - EarliestStart(T) = max(EarliestFinish(dep)) for deps, or homeStart if no deps.
 * - EarliestFinish(T): if COMPLETE use actualFinish; else start = max(EarliestFinish(deps), scheduledStartDate ?? homeStart), finish = addWorkingDays(start, durationDays).
 * - Home forecast date = max(EarliestFinish(T)) over all tasks.
 */
export function computeHomeForecast(
  tasks: TaskNode[],
  homeStart: Date,
  options?: { fallbackCompleteDate?: Date }
): ForecastResult {
  const fallbackComplete = options?.fallbackCompleteDate ?? startOfDay(new Date())
  const homeStartNorm = normalizeToWorkingDay(startOfDay(homeStart))
  const warnings: string[] = []

  const { order, cycleTaskIds, warnings: cycleWarnings } = topologicalSort(tasks)
  warnings.push(...cycleWarnings)

  const taskIdsInOrder = new Set(order.map((t) => t.id))
  const idToTask = new Map(tasks.map((t) => [t.id, t]))

  const ES: Record<string, Date> = {}
  const EF: Record<string, Date> = {}
  const criticalPredecessor: Record<string, string | null> = {}

  for (const task of order) {
    const id = task.id
    const duration = Math.max(0, task.durationDays)
    const preds = task.dependencyIds.filter((depId) => taskIdsInOrder.has(depId))

    if (task.status === COMPLETE) {
      let actualFinish: Date
      if (task.completedAt) {
        actualFinish = startOfDay(new Date(task.completedAt))
      } else {
        actualFinish = task.scheduledEndDate
          ? startOfDay(new Date(task.scheduledEndDate))
          : fallbackComplete
        warnings.push(`Task ${task.name ?? id} is COMPLETE but has no completedAt; used scheduledEndDate or fallback`)
      }
      if (preds.length === 0) {
        ES[id] = homeStartNorm
        criticalPredecessor[id] = null
      } else {
        const maxPredFinish = preds.reduce((max, p) => {
          const pf = EF[p]
          return !pf ? max : !max ? pf : pf > max ? pf : max
        }, null as Date | null)
        ES[id] = maxPredFinish ?? homeStartNorm
        criticalPredecessor[id] = preds.reduce((best, p) => (EF[p]! >= EF[best]! ? p : best), preds[0])
      }
      EF[id] = actualFinish
      continue
    }

    let earliestStart: Date
    if (preds.length === 0) {
      earliestStart = homeStartNorm
      criticalPredecessor[id] = null
    } else {
      const predFinishes = preds.map((p) => EF[p]!).filter(Boolean)
      const maxPredFinish = predFinishes.reduce((a, b) => (a > b ? a : b))
      earliestStart = maxPredFinish
      criticalPredecessor[id] = preds.reduce((best, p) => (EF[p]! >= EF[best]! ? p : best), preds[0])
    }

    const scheduledStart = task.scheduledStartDate ? startOfDay(new Date(task.scheduledStartDate)) : null
    const start = scheduledStart && scheduledStart > earliestStart ? scheduledStart : earliestStart
    ES[id] = start
    EF[id] = duration === 0 ? start : addWorkingDays(start, duration)
  }

  let projectFinish: Date = homeStartNorm
  let finishTaskId: string | null = null
  for (const task of order) {
    const f = EF[task.id]
    if (f && f > projectFinish) {
      projectFinish = f
      finishTaskId = task.id
    }
  }

  const criticalPathTaskIds: string[] = []
  let current: string | null = finishTaskId
  while (current) {
    criticalPathTaskIds.unshift(current)
    current = criticalPredecessor[current] ?? null
  }

  const taskEarlyStart: Record<string, Date> = {}
  const taskEarlyFinish: Record<string, Date> = {}
  for (const task of order) {
    if (ES[task.id]) taskEarlyStart[task.id] = ES[task.id]
    if (EF[task.id]) taskEarlyFinish[task.id] = EF[task.id]
  }

  return {
    forecastDate: projectFinish,
    forecastDateISO: projectFinish.toISOString(),
    criticalPathTaskIds,
    warnings,
    taskEarlyStart,
    taskEarlyFinish,
  }
}

/**
 * When TemplateDependency rows are missing or incomplete, CPM undercounts. Floor finish with
 * phase-based remaining WD (Construction Timeline / template category sequence + incomplete
 * work in the active category) — not a % of total task duration.
 */
export function applyForecastSanityFloor(
  cpm: ForecastResult,
  opts: {
    homeStart: Date
    taskNodes: TaskNode[]
    /** From computePhaseBasedRemainingWorkingDays; null skips floor. */
    remainingWorkingDays: number | null
    debugLabel?: string
  }
): ForecastResult {
  const { homeStart, taskNodes, remainingWorkingDays: remWd } = opts
  if (remWd == null || remWd <= 0 || taskNodes.length === 0) {
    return cpm
  }

  const homeStartNorm = normalizeToWorkingDay(startOfDay(homeStart))
  let anchorMs = homeStartNorm.getTime()
  for (const t of taskNodes) {
    if (t.status === COMPLETE && t.completedAt) {
      const ms = startOfDay(new Date(t.completedAt)).getTime()
      if (ms > anchorMs) anchorMs = ms
    }
  }

  const anchorDate = normalizeToWorkingDay(new Date(anchorMs))
  const floorFinish = addWorkingDays(anchorDate, remWd)

  if (floorFinish.getTime() <= cpm.forecastDate.getTime()) {
    return cpm
  }

  const warnings = [
    ...cpm.warnings,
    `Forecast raised to phase-based template floor (~${remWd} wd remaining vs CPM ${startOfDay(cpm.forecastDate).toISOString().slice(0, 10)})`,
  ]

  if (process.env.FORECAST_SANITY_DEBUG === "1") {
    console.log("[forecast:sanity]", {
      label: opts.debugLabel,
      remainingWorkingDays: remWd,
      completedTaskCount: taskNodes.filter((t) => t.status === COMPLETE).length,
      totalTasks: taskNodes.length,
      anchor: anchorDate.toISOString(),
      cpmFinish: cpm.forecastDate.toISOString(),
      floorFinish: floorFinish.toISOString(),
    })
  }

  return {
    ...cpm,
    forecastDate: floorFinish,
    forecastDateISO: floorFinish.toISOString(),
    warnings,
  }
}

// --- Persistence: load from DB, compute, write back ---

import { prisma } from "./prisma"
import { homeTaskOrderByTemplateSequence } from "./work-template-display-order"
import { deriveOrderedCategories } from "./dashboard/phaseDistribution"
import { getTenantTemplateForecastPhaseData } from "./forecast-template-total"
import { computePhaseBasedRemainingWorkingDays } from "./forecast-phase-remaining"

type HomeTaskRow = {
  id: string
  templateItemId: string
  nameSnapshot: string
  durationDaysSnapshot: number
  status: string
  scheduledDate: Date | null
  completedAt: Date | null
  sortOrderSnapshot: number
  templateItem: {
    name: string
    optionalCategory: string | null
    sortOrder: number
    sequenceOrder: number | null
  }
}

function mapStatus(status: string): TaskStatusForForecast {
  if (status === "Completed") return "COMPLETE"
  if (status === "InProgress") return "IN_PROGRESS"
  return "NOT_STARTED"
}

/** Build TaskNode[] from Prisma home tasks and template dependencies (for batch/list use). */
export function buildTaskNodesFromPrismaTasks(
  tasks: Array<{
    id: string
    templateItemId: string
    nameSnapshot: string
    durationDaysSnapshot: number
    status: string
    scheduledDate: Date | null
    completedAt: Date | null
  }>,
  templateDeps: Array<{ templateItemId: string; dependsOnItemId: string }>
): TaskNode[] {
  const templateIdToTaskId = new Map(tasks.map((t) => [t.templateItemId, t.id]))
  return tasks.map((t) => ({
    id: t.id,
    name: t.nameSnapshot,
    durationDays: Math.max(0, t.durationDaysSnapshot),
    status: mapStatus(t.status),
    dependencyIds: templateDeps
      .filter((d) => d.templateItemId === t.templateItemId)
      .map((d) => templateIdToTaskId.get(d.dependsOnItemId))
      .filter((id): id is string => id != null),
    scheduledStartDate: t.scheduledDate,
    scheduledEndDate: null,
    completedAt: t.completedAt,
  }))
}

/** Get home start date from home and its tasks. */
export function getHomeStart(
  home: { startDate: Date | null; createdAt: Date },
  tasks: Array<{ scheduledDate: Date | null }>
): Date {
  if (home.startDate) {
    const d = new Date(home.startDate)
    d.setHours(0, 0, 0, 0)
    return normalizeToWorkingDay(d)
  }
  const scheduledDates = tasks.map((t) => t.scheduledDate).filter((d): d is Date => d != null)
  if (scheduledDates.length > 0) {
    const earliest = new Date(Math.min(...scheduledDates.map((d) => d.getTime())))
    earliest.setHours(0, 0, 0, 0)
    return normalizeToWorkingDay(earliest)
  }
  const d = new Date(home.createdAt)
  d.setHours(0, 0, 0, 0)
  return normalizeToWorkingDay(d)
}

/**
 * Load home and its tasks with template dependencies; build TaskNode[] and homeStart; run pure CPM; persist to Home and HomeTask.
 */
export async function computeHomeForecastAndPersist(homeId: string): Promise<void> {
  const home = await prisma.home.findUnique({
    where: { id: homeId },
    include: {
      tasks: {
        orderBy: [...homeTaskOrderByTemplateSequence()],
        select: {
          id: true,
          templateItemId: true,
          nameSnapshot: true,
          durationDaysSnapshot: true,
          status: true,
          scheduledDate: true,
          completedAt: true,
          sortOrderSnapshot: true,
          templateItem: {
            select: {
              name: true,
              optionalCategory: true,
              sortOrder: true,
              sequenceOrder: true,
            },
          },
        },
      },
      subdivision: { select: { companyId: true } },
    },
  })

  if (!home) throw new Error("Home not found")

  const tasks = home.tasks as HomeTaskRow[]
  if (tasks.length === 0) {
    const homeStart = home.startDate
      ? normalizeToWorkingDay(new Date(home.startDate))
      : new Date(home.createdAt)
    await prisma.home.update({
      where: { id: home.id },
      data: {
        forecastCompletionDate: homeStart,
        forecastTotalWorkingDays: 0,
        forecastComputedAt: new Date(),
      },
    })
    return
  }

  const companyId = home.companyId ?? null
  const templateDeps = await prisma.templateDependency.findMany({
    where: { OR: companyId ? [{ companyId }, { companyId: null }] : [{ companyId: null }] },
    select: { templateItemId: true, dependsOnItemId: true },
  })

  const templateIdToTaskId = new Map<string, string>()
  for (const t of tasks) {
    templateIdToTaskId.set(t.templateItemId, t.id)
  }

  const dependencyIdsByTaskId: Record<string, string[]> = {}
  for (const t of tasks) {
    const deps = templateDeps
      .filter((d) => d.templateItemId === t.templateItemId)
      .map((d) => templateIdToTaskId.get(d.dependsOnItemId))
      .filter((id): id is string => id != null)
    dependencyIdsByTaskId[t.id] = deps
  }

  const taskNodes: TaskNode[] = tasks.map((t) => ({
    id: t.id,
    name: t.nameSnapshot,
    durationDays: Math.max(0, t.durationDaysSnapshot),
    status: mapStatus(t.status),
    dependencyIds: dependencyIdsByTaskId[t.id] ?? [],
    scheduledStartDate: t.scheduledDate,
    scheduledEndDate: null,
    completedAt: t.completedAt,
  }))

  let homeStart: Date
  if (home.startDate) {
    homeStart = new Date(home.startDate)
  } else {
    const scheduledDates = tasks.map((t) => t.scheduledDate).filter((d): d is Date => d != null)
    if (scheduledDates.length > 0) {
      homeStart = new Date(Math.min(...scheduledDates.map((d) => d.getTime())))
    } else {
      homeStart = new Date(home.createdAt)
    }
  }
  homeStart.setHours(0, 0, 0, 0)
  homeStart = normalizeToWorkingDay(homeStart)

  const cpm = computeHomeForecast(taskNodes, homeStart)
  let result = cpm
  const tenantCompanyId = home.companyId ?? home.subdivision?.companyId ?? null
  if (tenantCompanyId) {
    const phaseHomeForOrder = {
      id: home.id,
      addressOrLot: home.addressOrLot,
      startDate: home.startDate,
      createdAt: home.createdAt,
      isComplete: home.isComplete,
      tasks: tasks.map((t) => ({
        id: t.id,
        status: t.status,
        scheduledDate: t.scheduledDate,
        templateItem: {
          name: t.templateItem.name,
          optionalCategory: t.templateItem.optionalCategory,
          sortOrder: t.templateItem.sortOrder,
          sequenceOrder: t.templateItem.sequenceOrder,
        },
      })),
    }
    const extraCategoryNames = deriveOrderedCategories([phaseHomeForOrder]).map((c) => c.name)
    const phaseData = await getTenantTemplateForecastPhaseData(
      prisma,
      tenantCompanyId,
      extraCategoryNames
    )
    const remainingWd =
      phaseData != null
        ? computePhaseBasedRemainingWorkingDays(
            {
              id: home.id,
              addressOrLot: home.addressOrLot,
              startDate: home.startDate,
              createdAt: home.createdAt,
              isComplete: home.isComplete,
              tasks: tasks.map((t) => ({
                id: t.id,
                status: t.status,
                scheduledDate: t.scheduledDate,
                durationDaysSnapshot: t.durationDaysSnapshot,
                templateItem: t.templateItem,
              })),
            },
            phaseData
          )
        : null
    result = applyForecastSanityFloor(cpm, {
      homeStart,
      taskNodes,
      remainingWorkingDays: remainingWd,
      debugLabel: `persist:${home.id}`,
    })
  }

  const totalWorkingDays = result.forecastDate.getTime() > homeStart.getTime()
    ? workingDaysBetween(homeStart, result.forecastDate)
    : 0

  await prisma.$transaction([
    ...tasks.map((task) => {
      const earlyStart = result.taskEarlyStart?.[task.id]
      const earlyFinish = result.taskEarlyFinish?.[task.id]
      const esOffset = earlyStart ? workingDaysBetween(homeStart, earlyStart) : null
      const efOffset = earlyFinish ? workingDaysBetween(homeStart, earlyFinish) : null
      return prisma.homeTask.update({
        where: { id: task.id },
        data: {
          forecastEarlyStartOffsetWorkingDays: esOffset ?? undefined,
          forecastEarlyFinishOffsetWorkingDays: efOffset ?? undefined,
          isCriticalPath: result.criticalPathTaskIds.includes(task.id),
          blockedByCount: dependencyIdsByTaskId[task.id]?.length ?? 0,
        },
      })
    }),
    prisma.home.update({
      where: { id: home.id },
      data: {
        forecastTotalWorkingDays: totalWorkingDays,
        forecastCompletionDate: result.forecastDate,
        forecastComputedAt: new Date(),
      },
    }),
  ])
}
