export type ScheduleStatus = "on_track" | "at_risk" | "behind"

/**
 * Computes schedule status from forecast vs target completion dates.
 * Easy to replace later with working-days or more complex logic.
 *
 * Rules:
 * - forecast <= target => On Track
 * - forecast within +7 calendar days of target => At Risk
 * - forecast > target + 7 days => Behind
 */
export function getScheduleStatus(
  forecastCompletionDate: string | null,
  targetCompletionDate: string | null
): ScheduleStatus {
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
