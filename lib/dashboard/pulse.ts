export type DashboardTaskForPulse = {
  id: string
  status: string
  scheduledDate: Date | null
  completedAt: Date | null
  updatedAt: Date
  isCriticalPath: boolean
  /** Snapshot of template duration; 0-day items are schedule milestones (see template Gantt). */
  durationDaysSnapshot: number
  templateItem: {
    name: string
    isCriticalGate: boolean
  }
}

export type DashboardHomeForPulse = {
  id: string
  addressOrLot: string
  startDate: Date | null
  createdAt: Date
  isComplete: boolean
  subdivision: {
    id: string
    name: string
  }
  tasks: DashboardTaskForPulse[]
}

export type PulseHome = {
  homeId: string
  address: string
  notStarted: boolean
  lastCriticalTaskName: string | null
  lastCriticalCompletedAt: string | null
}

export type PulseSubdivisionGroup = {
  subdivisionId: string
  subdivisionName: string
  homes: PulseHome[]
}

export type LastCriticalSelection = {
  taskId: string | null
  taskName: string | null
  completedAt: Date | null
}

/**
 * Tasks that count as milestones for Field Pulse (full build history — no phase filter).
 * Aligns with app “critical” concepts: gates, forecast critical path, and 0-day schedule milestones.
 */
export function isPulseMilestoneTask(t: DashboardTaskForPulse): boolean {
  return (
    t.templateItem.isCriticalGate ||
    t.isCriticalPath ||
    (typeof t.durationDaysSnapshot === "number" && t.durationDaysSnapshot <= 0)
  )
}

function completionSortMs(t: DashboardTaskForPulse): number {
  if (t.completedAt) return t.completedAt.getTime()
  return t.updatedAt.getTime()
}

/**
 * Most recently completed milestone across all home tasks (not limited to current phase).
 * Uses status === Completed, ordered by completedAt descending, then updatedAt.
 */
export function selectLastCriticalCompletedTask(
  tasks: DashboardTaskForPulse[]
): LastCriticalSelection {
  if (!tasks || tasks.length === 0) {
    return { taskId: null, taskName: null, completedAt: null }
  }

  const milestoneTasks = tasks.filter(isPulseMilestoneTask)
  const completed = milestoneTasks
    .filter((t) => t.status === "Completed")
    .slice()
    .sort((a, b) => completionSortMs(b) - completionSortMs(a))

  if (completed.length === 0) {
    return { taskId: null, taskName: null, completedAt: null }
  }

  const latest = completed[0]
  return {
    taskId: latest.id,
    taskName: latest.templateItem.name,
    completedAt: latest.completedAt ?? latest.updatedAt,
  }
}

export type PulseMilestoneDebugRow = {
  homeId: string
  address: string
  milestoneCandidates: Array<{ taskId: string; name: string; gate: boolean; criticalPath: boolean; zeroDay: boolean }>
  completedMilestones: Array<{
    taskId: string
    name: string
    completedAt: string | null
    updatedAt: string
    sortMs: number
  }>
  selected: { taskId: string; name: string } | null
  reasonIfNone: string | null
}

/** When DASHBOARD_PULSE_MILESTONE_DEBUG=1, pass rows into computePulseBySubdivision. */
export function buildPulseMilestoneDebugRow(
  home: DashboardHomeForPulse,
  selection: LastCriticalSelection
): PulseMilestoneDebugRow {
  const tasks = home.tasks ?? []
  const milestoneCandidates = tasks.filter(isPulseMilestoneTask).map((t) => ({
    taskId: t.id,
    name: t.templateItem.name,
    gate: t.templateItem.isCriticalGate,
    criticalPath: t.isCriticalPath,
    zeroDay: typeof t.durationDaysSnapshot === "number" && t.durationDaysSnapshot <= 0,
  }))
  const completedMilestones = tasks
    .filter(isPulseMilestoneTask)
    .filter((t) => t.status === "Completed")
    .map((t) => ({
      taskId: t.id,
      name: t.templateItem.name,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      updatedAt: t.updatedAt.toISOString(),
      sortMs: completionSortMs(t),
    }))
    .sort((a, b) => b.sortMs - a.sortMs)

  const selected: PulseMilestoneDebugRow["selected"] =
    selection.taskId && selection.taskName
      ? { taskId: selection.taskId, name: selection.taskName }
      : null

  let reasonIfNone: string | null = null
  if (!selection.taskName) {
    const anyCompleted = tasks.some((t) => t.status === "Completed")
    if (!anyCompleted) {
      reasonIfNone = "no completed tasks on home"
    } else if (milestoneCandidates.length === 0) {
      reasonIfNone =
        "no tasks qualify as milestones (need isCriticalGate, isCriticalPath, or 0-day duration snapshot)"
    } else {
      reasonIfNone = "milestone tasks exist but none marked Completed"
    }
  }

  return {
    homeId: home.id,
    address: home.addressOrLot,
    milestoneCandidates,
    completedMilestones,
    selected,
    reasonIfNone,
  }
}

function isHomeNotStarted(home: { startDate: Date | null; tasks: { scheduledDate: Date | null }[] }) {
  const tasks = home.tasks ?? []
  const hasTasks = tasks.length > 0
  const hasStartDate = !!home.startDate
  const hasScheduled = tasks.some((t) => t.scheduledDate != null)
  return !hasTasks || (!hasStartDate && !hasScheduled)
}

/**
 * Compute Pulse groups (by subdivision) from a set of active homes.
 * @param options.debug + options.debugRows — when `process.env.DASHBOARD_PULSE_MILESTONE_DEBUG === "1"`, pass `{ debug: true, debugRows: [] }` to collect rows for homes that have completed tasks but no displayed milestone.
 */
export function computePulseBySubdivision(
  homes: DashboardHomeForPulse[],
  options?: { debug?: boolean; debugRows?: PulseMilestoneDebugRow[] }
): PulseSubdivisionGroup[] {
  const groupsBySubdivision = new Map<string, PulseSubdivisionGroup>()
  const debug = options?.debug === true
  const debugRows = options?.debugRows

  for (const home of homes) {
    const notStarted = isHomeNotStarted({ startDate: home.startDate, tasks: home.tasks })
    const { taskId, taskName, completedAt } = selectLastCriticalCompletedTask(home.tasks)

    if (debug && debugRows && !taskName && home.tasks.some((t) => t.status === "Completed")) {
      debugRows.push(buildPulseMilestoneDebugRow(home, { taskId, taskName, completedAt }))
    }

    const subdivisionId = home.subdivision.id
    const subdivisionName = home.subdivision.name

    if (!groupsBySubdivision.has(subdivisionId)) {
      groupsBySubdivision.set(subdivisionId, {
        subdivisionId,
        subdivisionName,
        homes: [],
      })
    }
    const group = groupsBySubdivision.get(subdivisionId)!
    group.homes.push({
      homeId: home.id,
      address: home.addressOrLot,
      notStarted,
      lastCriticalTaskName: taskName,
      lastCriticalCompletedAt: completedAt ? completedAt.toISOString() : null,
    })
  }

  // Sort homes within each subdivision:
  // 1) Most recent lastCriticalCompletedAt (desc)
  // 2) Homes with no lastCritical at bottom
  // 3) Address alpha as tie-breaker
  for (const group of groupsBySubdivision.values()) {
    group.homes.sort((a, b) => {
      const aHas = !!a.lastCriticalCompletedAt
      const bHas = !!b.lastCriticalCompletedAt
      if (aHas && bHas) {
        const aDate = new Date(a.lastCriticalCompletedAt!).getTime()
        const bDate = new Date(b.lastCriticalCompletedAt!).getTime()
        if (aDate !== bDate) return bDate - aDate
      } else if (aHas && !bHas) {
        return -1
      } else if (!aHas && bHas) {
        return 1
      }
      return a.address.localeCompare(b.address)
    })
  }

  // Sort subdivisions alphabetically by name
  return Array.from(groupsBySubdivision.values()).sort((a, b) =>
    a.subdivisionName.localeCompare(b.subdivisionName)
  )
}

