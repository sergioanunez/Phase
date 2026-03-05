export type ScheduleStatus = "not_started" | "on_track" | "at_risk" | "behind"

export type GetScheduleStatusOptions = {
  startDate?: string | Date | null
  /** Number of task instances that have a scheduled date (construction has been scheduled). */
  scheduledTaskCount?: number
}

/**
 * Computes schedule status from whether the home has started, then forecast vs target.
 *
 * Rules (evaluated in order):
 * - If home.startDate is null OR there are zero scheduled tasks => NOT_STARTED
 * - Else: forecast <= target => On Track
 * - Else: forecast within +7 calendar days of target => At Risk
 * - Else: Behind
 */
export function getScheduleStatus(
  forecastCompletionDate: string | null,
  targetCompletionDate: string | null,
  options?: GetScheduleStatusOptions
): ScheduleStatus {
  const startDate = options?.startDate
  const scheduledTaskCount = options?.scheduledTaskCount ?? 0
  const hasStarted = startDate != null && scheduledTaskCount > 0

  if (!hasStarted) {
    return "not_started"
  }

  if (!forecastCompletionDate || !targetCompletionDate) {
    return "on_track"
  }

  const forecast = new Date(forecastCompletionDate)
  const target = new Date(targetCompletionDate)

  if (forecast <= target) {
    return "on_track"
  }

  const targetPlus7 = new Date(target)
  targetPlus7.setDate(targetPlus7.getDate() + 7)

  if (forecast <= targetPlus7) {
    return "at_risk"
  }

  return "behind"
}
