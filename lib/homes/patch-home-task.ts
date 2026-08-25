/**
 * Local House Details task patch helpers (P1 performance).
 * Pure functions — no React, no network.
 */

export type PatchableTask = {
  id: string
  [key: string]: unknown
}

export type HomeWithTasks<T extends PatchableTask = PatchableTask> = {
  id: string
  tasks: T[]
  forecastCompletionDate?: string | null
  forecastTotalWorkingDays?: number | null
  forecastComputedAt?: string | null
  [key: string]: unknown
}

/** Fields that background forecast reconciliation may safely overwrite on each task. */
export const FORECAST_TASK_FIELDS = [
  "forecastEarlyStartOffsetWorkingDays",
  "forecastEarlyFinishOffsetWorkingDays",
  "isCriticalPath",
  "blockedByCount",
  /** Punch counts are server-derived; safe to refresh without clobbering status. */
  "hasOpenPunch",
  "punchOpenCount",
] as const

/** Home-level fields from a forecast / home GET that may update without replacing tasks. */
export const FORECAST_HOME_FIELDS = [
  "forecastCompletionDate",
  "forecastTotalWorkingDays",
  "forecastComputedAt",
] as const

/**
 * Merge server task payload into an existing local task.
 * Server fields win for keys present on the update; local-only keys are preserved.
 */
export function mergeHomeTask<T extends PatchableTask>(
  local: T,
  updated: PatchableTask
): T {
  if (local.id !== updated.id) return local
  const next = { ...local } as T
  for (const [key, value] of Object.entries(updated)) {
    if (key === "home" || key === "templateItem") {
      // Prefer nested objects when provided; keep local if update omits useful shape.
      if (value != null && typeof value === "object") {
        const localNested = (local as Record<string, unknown>)[key]
        ;(next as Record<string, unknown>)[key] =
          localNested && typeof localNested === "object"
            ? { ...(localNested as object), ...(value as object) }
            : value
      }
      continue
    }
    if (value !== undefined) {
      ;(next as Record<string, unknown>)[key] = value
    }
  }
  return next
}

/**
 * Patch a single task inside a home without replacing unrelated home/task data.
 * Returns the previous home unchanged if task id is not found (still immutable).
 */
export function patchHomeTask<T extends PatchableTask>(
  home: HomeWithTasks<T> | null | undefined,
  updated: PatchableTask
): HomeWithTasks<T> | null {
  if (!home) return null
  const idx = home.tasks.findIndex((t) => t.id === updated.id)
  if (idx < 0) {
    return home
  }
  const tasks = home.tasks.slice()
  tasks[idx] = mergeHomeTask(tasks[idx]!, updated)
  return { ...home, tasks }
}

/**
 * Apply a background forecast/home GET without clobbering mutation-confirmed task state.
 * Updates home-level forecast fields and per-task forecast-derived fields only.
 */
export function applyForecastReconcileToHome<T extends PatchableTask>(
  prev: HomeWithTasks<T>,
  remote: HomeWithTasks<PatchableTask>
): HomeWithTasks<T> {
  const remoteById = new Map(remote.tasks.map((t) => [t.id, t]))
  const tasks = prev.tasks.map((local) => {
    const remoteTask = remoteById.get(local.id)
    if (!remoteTask) return local
    const next = { ...local } as T
    for (const field of FORECAST_TASK_FIELDS) {
      if (field in remoteTask) {
        ;(next as Record<string, unknown>)[field] = remoteTask[field]
      }
    }
    return next
  })

  const nextHome: HomeWithTasks<T> = { ...prev, tasks }
  for (const field of FORECAST_HOME_FIELDS) {
    if (field in remote) {
      ;(nextHome as Record<string, unknown>)[field] = remote[field]
    }
  }
  // Home completion flags may change after Complete / N/A
  if ("isComplete" in remote) {
    ;(nextHome as Record<string, unknown>).isComplete = remote.isComplete
  }
  if ("completedAt" in remote) {
    ;(nextHome as Record<string, unknown>).completedAt = remote.completedAt
  }
  return nextHome
}
