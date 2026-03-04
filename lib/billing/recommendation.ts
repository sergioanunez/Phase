export type BillingPlanKey = "starter" | "growth" | "scale"

export const PLAN_LIMITS: Record<BillingPlanKey, number> = {
  starter: 5,
  growth: 25,
  scale: Number.POSITIVE_INFINITY,
}

export const PLAN_PRICES: Record<BillingPlanKey, number> = {
  starter: 199,
  growth: 399,
  scale: 799,
}

export const PLAN_LABELS: Record<BillingPlanKey, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
}

export function recommendPlan(activeHomesCount: number): BillingPlanKey {
  if (activeHomesCount <= 0 || Number.isNaN(activeHomesCount)) {
    return "starter"
  }
  if (activeHomesCount === Number.POSITIVE_INFINITY || activeHomesCount > PLAN_LIMITS.growth) {
    return "scale"
  }
  if (activeHomesCount <= PLAN_LIMITS.starter) return "starter"
  if (activeHomesCount <= PLAN_LIMITS.growth) return "growth"
  return "scale"
}

export function getRecommendedPlanLabel(planKey: BillingPlanKey): string {
  return PLAN_LABELS[planKey] ?? planKey
}

/** Plan limit for display (Starter=5, Growth=25, Scale=null for unlimited). */
export function getPlanLimit(planKey: BillingPlanKey | string | null): number | null {
  if (planKey == null || typeof planKey !== "string") return null
  const key = planKey.toLowerCase() as BillingPlanKey
  if (!(key in PLAN_LIMITS)) return null
  const limit = PLAN_LIMITS[key]
  return limit === Number.POSITIVE_INFINITY ? null : limit
}

/**
 * Human-readable reason why this plan is recommended (e.g. over limit).
 * Returns null if no reason needed (e.g. already on recommended plan).
 */
export function getRecommendedPlanReason(
  recommendedKey: BillingPlanKey,
  activeHomesCount: number,
  currentPlanKey: BillingPlanKey | null
): string | null {
  const limit = currentPlanKey ? PLAN_LIMITS[currentPlanKey] : null
  const effectiveLimit = limit === Number.POSITIVE_INFINITY ? null : limit
  const currentLabel = currentPlanKey ? getRecommendedPlanLabel(currentPlanKey) : "your plan"
  if (effectiveLimit != null && activeHomesCount > effectiveLimit) {
    return `Recommended because you have ${activeHomesCount} active home${activeHomesCount === 1 ? "" : "s"} (${currentLabel} supports ${effectiveLimit}).`
  }
  if (effectiveLimit != null && activeHomesCount >= effectiveLimit) {
    return `Recommended because you're at the ${currentLabel} limit (${effectiveLimit} active homes).`
  }
  if (!currentPlanKey && activeHomesCount > 0) {
    return `Recommended for your volume (${activeHomesCount} active home${activeHomesCount === 1 ? "" : "s"}).`
  }
  return null
}

