export type WhiteLabelSubscriptionLike = {
  /**
   * Derived company-level status, e.g. "ACTIVE" | "TRIAL" | "PAST_DUE" | "DISABLED".
   * This is intentionally a string to avoid tight coupling to Prisma types.
   */
  companyStatus?: string | null
  /**
   * Raw Stripe subscription status when available, e.g. "trialing" | "active" | "incomplete_expired".
   * Optional – the white label experience should not depend solely on this.
   */
  subscriptionStatus?: string | null
  /**
   * When the free trial ends. If missing, the trial is treated as inactive.
   */
  trialEndsAt?: Date | null
  /**
   * Whether the tenant has the paid white label add-on enabled (from entitlements).
   */
  whiteLabelAddOn?: boolean
}

/**
 * Returns true when the tenant is currently in an active trial window.
 *
 * Rules:
 * - Primary signal is companyStatus === "TRIAL".
 * - subscriptionStatus === "trialing" is treated as an additional hint but not required.
 * - trialEndsAt must be in the future relative to `now`.
 */
export function isTrialActive(
  sub: WhiteLabelSubscriptionLike | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sub) return false
  const status = (sub.companyStatus || "").toUpperCase()
  const stripeStatus = (sub.subscriptionStatus || "").toLowerCase()
  const trialEndsAt = sub.trialEndsAt
  if (!trialEndsAt || !(trialEndsAt instanceof Date) || Number.isNaN(trialEndsAt.getTime())) {
    return false
  }
  const withinWindow = trialEndsAt.getTime() > now.getTime()
  if (!withinWindow) return false

  const isCompanyTrial = status === "TRIAL"
  const isStripeTrial = stripeStatus === "trialing"

  return isCompanyTrial || isStripeTrial
}

/**
 * Returns true when the tenant has a paid white label add-on.
 * This should be wired from entitlements (e.g. entitlements.whiteLabelEnabled).
 */
export function hasPaidWhiteLabel(sub: WhiteLabelSubscriptionLike | null | undefined): boolean {
  return !!sub?.whiteLabelAddOn
}

/**
 * Single source of truth for whether the **white label experience** should be active.
 *
 * This is intentionally broader than "has paid add-on":
 * - During an active trial, the tenant should see the white label experience
 *   (belt color + branded messages), even without the paid add-on.
 * - After the trial ends, only the paid add-on should continue to enable it.
 */
export function isWhiteLabelExperienceEnabled(
  sub: WhiteLabelSubscriptionLike | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sub) return false
  if (hasPaidWhiteLabel(sub)) return true
  return isTrialActive(sub, now)
}

