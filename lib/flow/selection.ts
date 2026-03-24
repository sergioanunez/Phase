/**
 * Flow selection: pick the single next actionable task per home using
 * dependency readiness (frontier) and blocking prerequisite when no frontier.
 */

export type FlowTaskForSelection = {
  id: string
  status: string
  scheduledDate?: Date | null
  forecastStart?: Date | null
  sortOrderSnapshot: number
  /** From WorkTemplateItem.sequenceOrder; nulls sort after set values in tie-breaks. */
  templateSequenceOrder?: number | null
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
 * True iff all dependency tasks have status COMPLETE.
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
    if (!dep || dep.status !== COMPLETED) return false
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
  const incomplete = tasks.filter((t) => t.status !== completedStatus)
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
