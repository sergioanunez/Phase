/**
 * Flow selection: pick the single next critical unscheduled task per home.
 */

import type { FlowUrgency } from "./types"

export type FlowTaskForSelection = {
  id: string
  status: string
  scheduledDate?: Date | null
  forecastStart?: Date | null
  sortOrderSnapshot: number
  /** From WorkTemplateItem.sequenceOrder; nulls sort after set values in tie-breaks. */
  templateSequenceOrder?: number | null
  /** Critical path and/or critical gate — required for Flow inbox. */
  isCritical?: boolean
}

function compareSequenceTieBreak(
  a: FlowTaskForSelection,
  b: FlowTaskForSelection
): number {
  const sa = a.templateSequenceOrder
  const sb = b.templateSequenceOrder
  const aHas = sa != null
  const bHas = sb != null
  if (aHas && bHas && sa !== sb) return sa - sb
  if (aHas && !bHas) return -1
  if (!aHas && bHas) return 1
  return a.sortOrderSnapshot - b.sortOrderSnapshot
}

const COMPLETED = "Completed"
const IN_PROGRESS = "InProgress"

export function buildTaskMap<T extends FlowTaskForSelection>(tasks: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const t of tasks) {
    map.set(t.id, t)
  }
  return map
}

/**
 * True iff all dependency tasks are resolved (completed or not applicable).
 */
export function isExecutionReady(
  taskId: string,
  taskMap: Map<string, FlowTaskForSelection>,
  getDependencyIds: (taskId: string) => string[]
): boolean {
  const depIds = getDependencyIds(taskId)
  if (depIds.length === 0) return true
  for (const depId of depIds) {
    const dep = taskMap.get(depId)
    if (!dep || (dep.status !== COMPLETED && dep.status !== "NotApplicable")) return false
  }
  return true
}

/**
 * Tasks that are NOT COMPLETE and are execution-ready (all deps COMPLETE).
 */
export function computeFrontierTasks<T extends FlowTaskForSelection>(
  tasks: T[],
  taskMap: Map<string, T>,
  getDependencyIds: (taskId: string) => string[],
  completedStatus: string = COMPLETED
): T[] {
  return tasks.filter(
    (t) =>
      t.status !== completedStatus &&
      t.status !== "NotApplicable" &&
      t.status !== "Canceled" &&
      isExecutionReady(t.id, taskMap as Map<string, FlowTaskForSelection>, getDependencyIds)
  )
}

/**
 * Earliest task by topological order (depth from roots), then by forecastStart/scheduledDate.
 * Used when frontier is empty: pick the blocking prerequisite to show as "Waiting on: X".
 * Prefer IN_PROGRESS task if any.
 */
export function computeBlockingFocusTask<T extends FlowTaskForSelection>(
  tasks: T[],
  taskMap: Map<string, T>,
  getDependencyIds: (taskId: string) => string[],
  topoOrder: string[],
  forecastStartByTaskId: Record<string, Date>,
  completedStatus: string = COMPLETED,
  inProgressStatus: string = IN_PROGRESS
): T | null {
  const incomplete = tasks.filter(
    (t) =>
      t.status !== completedStatus &&
      t.status !== "NotApplicable" &&
      t.status !== "Canceled"
  )
  if (incomplete.length === 0) return null

  const inProgress = incomplete.filter((t) => t.status === inProgressStatus)
  if (inProgress.length > 0) {
    return inProgress[0]
  }

  const topoIndex = new Map(topoOrder.map((id, i) => [id, i]))
  const byDepthThenDate = [...incomplete].sort((a, b) => {
    const depthA = topoIndex.get(a.id) ?? 999999
    const depthB = topoIndex.get(b.id) ?? 999999
    if (depthA !== depthB) return depthA - depthB
    const dateA = a.scheduledDate ?? a.forecastStart ?? forecastStartByTaskId[a.id]
    const dateB = b.scheduledDate ?? b.forecastStart ?? forecastStartByTaskId[b.id]
    if (!dateA && !dateB) return compareSequenceTieBreak(a, b)
    if (!dateA) return 1
    if (!dateB) return -1
    return dateA.getTime() - dateB.getTime()
  })
  return byDepthThenDate[0] ?? null
}

/**
 * From frontier tasks, pick the single next execution task: earliest by
 * scheduledDate ?? forecastStart ?? sortOrderSnapshot.
 */
export function pickNextExecutionTask<T extends FlowTaskForSelection>(
  frontierTasks: T[],
  forecastStartByTaskId: Record<string, Date>
): T | null {
  if (frontierTasks.length === 0) return null
  const sorted = [...frontierTasks].sort((a, b) => {
    const dateA = a.scheduledDate ?? a.forecastStart ?? forecastStartByTaskId[a.id]
    const dateB = b.scheduledDate ?? b.forecastStart ?? forecastStartByTaskId[b.id]
    if (!dateA && !dateB) return compareSequenceTieBreak(a, b)
    if (!dateA) return 1
    if (!dateB) return -1
    return dateA.getTime() - dateB.getTime()
  })
  return sorted[0] ?? null
}

/**
 * Walk work sequence: first CRITICAL task that is unscheduled, incomplete,
 * and whose predecessors are complete. One candidate per home for Flow inbox.
 */
export function pickNextCriticalUnscheduledTask<T extends FlowTaskForSelection>(
  tasks: T[],
  topoOrder: string[],
  taskMap: Map<string, T>,
  getDependencyIds: (taskId: string) => string[],
  forecastStartByTaskId: Record<string, Date>
): T | null {
  const topoIndex = new Map(topoOrder.map((id, i) => [id, i]))
  const candidates = tasks.filter((t) => {
    if (!t.isCritical) return false
    if (t.status === COMPLETED || t.status === "NotApplicable" || t.status === "Canceled") {
      return false
    }
    if (t.scheduledDate != null) return false
    return isExecutionReady(
      t.id,
      taskMap as Map<string, FlowTaskForSelection>,
      getDependencyIds
    )
  })

  if (candidates.length === 0) return null

  const sorted = [...candidates].sort((a, b) => {
    const depthA = topoIndex.get(a.id) ?? 999999
    const depthB = topoIndex.get(b.id) ?? 999999
    if (depthA !== depthB) return depthA - depthB
    const dateA = a.forecastStart ?? forecastStartByTaskId[a.id]
    const dateB = b.forecastStart ?? forecastStartByTaskId[b.id]
    if (!dateA && !dateB) return compareSequenceTieBreak(a, b)
    if (!dateA) return 1
    if (!dateB) return -1
    const cmp = dateA.getTime() - dateB.getTime()
    if (cmp !== 0) return cmp
    return compareSequenceTieBreak(a, b)
  })

  return sorted[0] ?? null
}

const URGENCY_RANK: Record<FlowUrgency, number> = {
  OVERDUE: 0,
  AT_RISK: 1,
  READY: 2,
  FUTURE: 3,
}

export function computeFlowUrgency(params: {
  forecastStart: Date
  today: Date
  slackWorkingDays?: number
}): FlowUrgency {
  const toDay = (d: Date) => {
    const x = new Date(d)
    const y = x.getFullYear()
    const m = String(x.getMonth() + 1).padStart(2, "0")
    const day = String(x.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  const startStr = toDay(params.forecastStart)
  const todayStr = toDay(params.today)
  const start = new Date(startStr + "T12:00:00")
  const today = new Date(todayStr + "T12:00:00")
  const msPerDay = 24 * 60 * 60 * 1000
  const daysUntil = Math.round((start.getTime() - today.getTime()) / msPerDay)

  if (daysUntil < 0) return "OVERDUE"
  if (daysUntil === 0) return "AT_RISK"
  if (params.slackWorkingDays != null && params.slackWorkingDays < 0) return "AT_RISK"
  if (daysUntil <= 7) return "READY"
  return "FUTURE"
}

export function compareFlowUrgency(
  a: { urgency: FlowUrgency; actionDate: string; slackWorkingDays?: number },
  b: { urgency: FlowUrgency; actionDate: string; slackWorkingDays?: number }
): number {
  const ra = URGENCY_RANK[a.urgency] ?? 99
  const rb = URGENCY_RANK[b.urgency] ?? 99
  if (ra !== rb) return ra - rb
  if (a.actionDate !== b.actionDate) return a.actionDate.localeCompare(b.actionDate)
  const slackA = a.slackWorkingDays ?? 999999
  const slackB = b.slackWorkingDays ?? 999999
  return slackA - slackB
}
