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

export function recommendPlan(activeHomesCount: number): BillingPlanKey {
  if (!Number.isFinite(activeHomesCount) || activeHomesCount <= 0) {
    return "starter"
  }
  if (activeHomesCount <= PLAN_LIMITS.starter) return "starter"
  if (activeHomesCount <= PLAN_LIMITS.growth) return "growth"
  return "scale"
}

