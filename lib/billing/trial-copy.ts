/**
 * Returns the middle segment of trial banner copy based on days remaining and trial expiry.
 * Used for: TRIAL · {dynamicMiddle} · {activeHomesCount} active home(s)
 */
export function getTrialBannerMiddleText(
  daysRemaining: number | null,
  trialExpired: boolean
): string {
  if (trialExpired) return "Trial ended"
  if (daysRemaining == null) return "Trial active"
  if (daysRemaining >= 15) return `${daysRemaining} days left`
  if (daysRemaining >= 7) return `${daysRemaining} days remaining`
  if (daysRemaining >= 3) return `Ends in ${daysRemaining} days`
  if (daysRemaining === 1 || daysRemaining === 2) return `Ends in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
  if (daysRemaining === 0) return "Ends today"
  return "Trial active"
}
