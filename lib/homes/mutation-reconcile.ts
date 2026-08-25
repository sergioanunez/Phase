/**
 * House Details post-mutation reconciliation policy (P1).
 *
 * Gates: GET /gates reflects punch-based critical-gate blocking.
 * Completing, starting, N/A, scheduling, and rescheduling do not change open punch counts,
 * so they skip gate refetch. Punch-list mutations still refresh gates.
 */

export type TaskMutationKind =
  | "complete"
  | "start"
  | "na"
  | "schedule"
  | "reschedule"
  | "cancel-schedule"
  | "confirm"
  | "mark-applicable"
  | "punch"
  | "other"

export type TaskMutationClientResult = {
  task?: { id: string; [key: string]: unknown }
  kind: TaskMutationKind
  /** When true, close TaskModal (default true for modal paths). */
  closeModal?: boolean
}

/** Whether this mutation can change punch-based gateStatuses. */
export function mutationNeedsGateRefresh(kind: TaskMutationKind): boolean {
  return kind === "punch" || kind === "other"
}

/**
 * When true, client should load persisted home/forecast fields via GET /homes/[id]
 * instead of GET /forecast (avoids duplicate computeHomeForecastAndPersist).
 */
export function mutationForecastAlreadyPersisted(kind: TaskMutationKind): boolean {
  return kind === "na"
}

/** Coalesce delay before background forecast/home reconcile (ms). */
export const FORECAST_RECONCILE_DEBOUNCE_MS = 350
