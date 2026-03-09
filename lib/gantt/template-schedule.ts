/**
 * Template-level Gantt: working-day schedule and critical path for work template items.
 * Uses Mon–Fri only (normalizeToWorkingDay, addWorkingDays).
 * Does not touch home-level or scheduling locks.
 */

import { addWorkingDays, normalizeToWorkingDay } from "@/lib/working-days"

export type TemplateTaskInput = {
  id: string
  name: string
  category: string | null
  durationDays: number
  dependencyIds: string[]
  sequenceOrder?: number
}

export type TemplateTaskScheduled = TemplateTaskInput & {
  startDate: Date
  endDate: Date
  isCritical: boolean
  /** Dependency depth: 0 if no deps, else 1 + max(depth(dep)) */
  depth: number
}

export type TemplateScheduleResult = {
  projectStartDate: Date
  tasks: TemplateTaskScheduled[]
  links: Array<{ from: string; to: string }>
  criticalPathIds: string[]
  cycleDetected: boolean
  cycleTaskIds: string[]
  error?: string
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * Topological sort with cycle detection.
 */
function topologicalSort(
  tasks: TemplateTaskInput[]
): { order: TemplateTaskInput[]; cycleTaskIds: string[] } {
  const idToTask = new Map(tasks.map((t) => [t.id, t]))
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
    cycleTaskIds.push(
      ...tasks.filter((t) => !orderIds.includes(t.id)).map((t) => t.id)
    )
  }

  const order = orderIds
    .map((id) => idToTask.get(id))
    .filter((t): t is TemplateTaskInput => t != null)

  return { order, cycleTaskIds }
}

/**
 * Compute dependency depth: depth(task) = 0 if no deps else 1 + max(depth(dep)).
 */
function computeDepths(
  tasks: TemplateTaskInput[],
  idToTask: Map<string, TemplateTaskInput>
): Record<string, number> {
  const depth: Record<string, number> = {}
  const visit = (id: string): number => {
    if (depth[id] != null) return depth[id]
    const task = idToTask.get(id)
    if (!task || task.dependencyIds.length === 0) {
      depth[id] = 0
      return 0
    }
    const maxDep = Math.max(
      ...task.dependencyIds.map((d) => (idToTask.has(d) ? visit(d) : 0))
    )
    depth[id] = 1 + maxDep
    return depth[id]
  }
  for (const t of tasks) visit(t.id)
  return depth
}

/**
 * Compute working-day schedule and critical path for template tasks.
 * - ForecastStart(task) = max(ForecastFinish(dep)) for deps, else projectStartDate
 * - ForecastFinish(task) = addWorkingDays(ForecastStart(task), duration_days)
 * - projectStartDate is normalized to a working day (Mon–Fri).
 * - Critical path = longest path (by duration); backtrack from task with max EF.
 */
export function computeTemplateSchedule(
  tasks: TemplateTaskInput[],
  projectStartDate: Date
): TemplateScheduleResult {
  const startNorm = normalizeToWorkingDay(startOfDay(projectStartDate))
  const idToTask = new Map(tasks.map((t) => [t.id, t]))

  const { order, cycleTaskIds } = topologicalSort(tasks)
  if (cycleTaskIds.length > 0) {
    return {
      projectStartDate: startNorm,
      tasks: [],
      links: [],
      criticalPathIds: [],
      cycleDetected: true,
      cycleTaskIds,
      error: `Dependency cycle detected involving: ${cycleTaskIds.join(", ")}`,
    }
  }

  const ES: Record<string, Date> = {}
  const EF: Record<string, Date> = {}
  const criticalPredecessor: Record<string, string | null> = {}

  for (const task of order) {
    const id = task.id
    const duration = Math.max(0, task.durationDays)
    const preds = task.dependencyIds.filter((depId) => idToTask.has(depId))

    let earliestStart: Date
    if (preds.length === 0) {
      earliestStart = startNorm
      criticalPredecessor[id] = null
    } else {
      const predFinishes = preds.map((p) => EF[p]!).filter(Boolean)
      const maxPredFinish = predFinishes.reduce((a, b) => (a > b ? a : b))
      earliestStart = maxPredFinish
      criticalPredecessor[id] = preds.reduce(
        (best, p) => (EF[p]! >= EF[best]! ? p : best),
        preds[0]
      )
    }

    ES[id] = earliestStart
    EF[id] =
      duration === 0
        ? earliestStart
        : addWorkingDays(earliestStart, duration)
  }

  let finishTaskId: string | null = null
  let projectEnd = startNorm
  for (const task of order) {
    const f = EF[task.id]
    if (f && f > projectEnd) {
      projectEnd = f
      finishTaskId = task.id
    }
  }

  const criticalPathIds: string[] = []
  let current: string | null = finishTaskId
  while (current) {
    criticalPathIds.unshift(current)
    current = criticalPredecessor[current] ?? null
  }

  const criticalSet = new Set(criticalPathIds)
  const depths = computeDepths(tasks, idToTask)

  const links: Array<{ from: string; to: string }> = []
  for (const task of tasks) {
    for (const depId of task.dependencyIds) {
      if (idToTask.has(depId)) links.push({ from: depId, to: task.id })
    }
  }

  const scheduled: TemplateTaskScheduled[] = order.map((t) => ({
    ...t,
    startDate: ES[t.id],
    endDate: EF[t.id],
    isCritical: criticalSet.has(t.id),
    depth: depths[t.id] ?? 0,
  }))

  return {
    projectStartDate: startNorm,
    tasks: scheduled,
    links,
    criticalPathIds,
    cycleDetected: false,
    cycleTaskIds: [],
  }
}
