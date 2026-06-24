/** Shared task status helpers for progress, Flow, forecast, and gates. */

export const TASK_STATUS_COMPLETED = "Completed" as const
export const TASK_STATUS_CANCELED = "Canceled" as const
export const TASK_STATUS_NOT_APPLICABLE = "NotApplicable" as const

/** Excluded from progress denominator (like canceled work). */
export function isExcludedFromProgress(status: string): boolean {
  return status === TASK_STATUS_CANCELED || status === TASK_STATUS_NOT_APPLICABLE
}

/** Excluded from Flow, calendar active schedule, and overdue treatment. */
export function isExcludedFromActiveWork(status: string): boolean {
  return status === TASK_STATUS_CANCELED || status === TASK_STATUS_NOT_APPLICABLE
}

/** Satisfies dependencies, gates, and phase progression (skipped or done). */
export function isTaskResolvedForScheduling(status: string): boolean {
  return status === TASK_STATUS_COMPLETED || status === TASK_STATUS_NOT_APPLICABLE
}

/** Still counts as incomplete work for home completion and progress %. */
export function isTaskIncompleteForProgress(status: string): boolean {
  return (
    status !== TASK_STATUS_COMPLETED &&
    status !== TASK_STATUS_CANCELED &&
    status !== TASK_STATUS_NOT_APPLICABLE
  )
}

export function labelForTaskStatus(status: string): string {
  if (status === "InProgress") return "In Progress"
  if (status === TASK_STATUS_NOT_APPLICABLE) return "Not Applicable"
  return status
}

export function badgeLabelForTaskStatus(status: string): string {
  if (status === TASK_STATUS_NOT_APPLICABLE) return "N/A"
  return labelForTaskStatus(status)
}
