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

