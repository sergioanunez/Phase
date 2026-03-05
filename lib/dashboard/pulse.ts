export type DashboardTaskForPulse = {
  id: string
  status: string
  scheduledDate: Date | null
  completedAt: Date | null
  updatedAt: Date
  isCriticalPath: boolean
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
  taskName: string | null
  completedAt: Date | null
}

/**
 * Select the most recent completed critical task from a home's tasks.
 * Critical tasks are determined by:
 * - First, tasks whose template item is marked isCriticalGate=true.
 * - Otherwise, tasks flagged as isCriticalPath=true.
 */
export function selectLastCriticalCompletedTask(
  tasks: DashboardTaskForPulse[]
): LastCriticalSelection {
  if (!tasks || tasks.length === 0) {
    return { taskName: null, completedAt: null }
  }

  const gateTasks = tasks.filter((t) => t.templateItem.isCriticalGate)
  const criticalCandidates =
    gateTasks.length > 0 ? gateTasks : tasks.filter((t) => t.isCriticalPath)

  const completedCritical = criticalCandidates.filter((t) => t.status === "Completed")
  if (completedCritical.length === 0) {
    return { taskName: null, completedAt: null }
  }

  const latest = completedCritical.reduce((best, task) => {
    const bestDate = best.completedAt ?? best.updatedAt
    const taskDate = task.completedAt ?? task.updatedAt
    return taskDate > bestDate ? task : best
  })

  return {
    taskName: latest.templateItem.name,
    completedAt: latest.completedAt ?? latest.updatedAt,
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
 */
export function computePulseBySubdivision(homes: DashboardHomeForPulse[]): PulseSubdivisionGroup[] {
  const groupsBySubdivision = new Map<string, PulseSubdivisionGroup>()

  for (const home of homes) {
    const notStarted = isHomeNotStarted({ startDate: home.startDate, tasks: home.tasks })
    const { taskName, completedAt } = selectLastCriticalCompletedTask(home.tasks)

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

