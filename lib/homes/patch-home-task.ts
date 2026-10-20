/**
 * Local House Details task patch helpers (P1 performance).
 * Pure functions — no React, no network.
 *
 * Concrete UI types (e.g. HomeTask) often lack string index signatures, so
 * PatchableTask / HomeWithTasks only require `id` + `tasks` — not `[key: string]`.
 */

/** Minimum shape for a task that can be patched in place. */
export type PatchableTask = {
  id: string
}

/**
 * Mutation / server payload merged into a local task.
 * No index signature — concrete UI `Task` types must remain assignable.
 * Extra fields are still read at runtime via Object.entries.
 */
export type TaskPatch = {
  id: string
}

export type HomeWithTasks<T extends PatchableTask = PatchableTask> = {
  id: string
  tasks: T[]
  forecastCompletionDate?: string | null
  forecastTotalWorkingDays?: number | null
  forecastComputedAt?: string | null
}

/** Remote home payload used for forecast reconciliation. */
export type HomePatch = {
  id: string
  tasks: Array<{ id: string }>
  forecastCompletionDate?: string | null
  forecastTotalWorkingDays?: number | null
  forecastComputedAt?: string | null
  isComplete?: boolean | null
  completedAt?: string | null
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
export function mergeHomeTask<T extends PatchableTask, U extends PatchableTask>(
  local: T,
  updated: U
): T {
  if (local.id !== updated.id) return local
  const next = { ...local } as T
  const nextRec = next as Record<string, unknown>
  const localRec = local as Record<string, unknown>
  for (const [key, value] of Object.entries(updated as Record<string, unknown>)) {
    if (key === "home" || key === "templateItem") {
      // Prefer nested objects when provided; keep local if update omits useful shape.
      if (value != null && typeof value === "object") {
        const localNested = localRec[key]
        nextRec[key] =
          localNested && typeof localNested === "object"
            ? { ...(localNested as object), ...(value as object) }
            : value
      }
      continue
    }
    if (value !== undefined) {
      nextRec[key] = value
    }
  }
  return next
}

/**
 * Patch a single task inside a home without replacing unrelated home/task data.
 * Returns the previous home unchanged if task id is not found (still immutable).
 */
export function patchHomeTask<H extends HomeWithTasks, U extends PatchableTask>(
  home: H | null | undefined,
  updated: U
): H | null {
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
export function applyForecastReconcileToHome<H extends HomeWithTasks>(
  prev: H,
  remote: HomePatch
): H {
  const remoteRec = remote as HomePatch & Record<string, unknown>
  const remoteById = new Map(
    remote.tasks.map((t) => [t.id, t as TaskPatch & Record<string, unknown>])
  )
  const tasks = prev.tasks.map((local) => {
    const remoteTask = remoteById.get(local.id)
    if (!remoteTask) return local
    const next = { ...local }
    const nextRec = next as Record<string, unknown>
    for (const field of FORECAST_TASK_FIELDS) {
      if (field in remoteTask) {
        nextRec[field] = remoteTask[field]
      }
    }
    return next
  })

  const nextHome = { ...prev, tasks } as H
  const nextHomeRec = nextHome as Record<string, unknown>
  for (const field of FORECAST_HOME_FIELDS) {
    if (field in remoteRec) {
      nextHomeRec[field] = remoteRec[field]
    }
  }
  // Home completion flags may change after Complete / N/A
  if ("isComplete" in remoteRec) {
    nextHomeRec.isComplete = remoteRec.isComplete
  }
  if ("completedAt" in remoteRec) {
    nextHomeRec.completedAt = remoteRec.completedAt
  }
  return nextHome
}
