import type { PrismaClient } from "@prisma/client"
import { recommendPlan, PLAN_LIMITS, PLAN_PRICES, type BillingPlanKey } from "./recommendation"
import { getTenantUsage } from "@/lib/entitlements"

export type SubscriptionGuardResult = {
  allowed: boolean
  trialExpired: boolean
  subscriptionStatus: string | null
  activeHomesCount: number
  recommendedPlan: {
    planKey: BillingPlanKey
    maxActiveHomes: number
    pricePerMonth: number
  }
}

export async function checkSubscriptionGuard(
  prisma: PrismaClient,
  tenantId: string
): Promise<SubscriptionGuardResult> {
  const company = await prisma.company.findFirst({
    where: { id: tenantId },
    select: {
      status: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  })
  const usage = await getTenantUsage(prisma, tenantId)

  const activeHomesCount = usage.activeHomesCount
  const recommendedKey: BillingPlanKey = recommendPlan(activeHomesCount)
  const recommendedPlan = {
    planKey: recommendedKey,
    maxActiveHomes: PLAN_LIMITS[recommendedKey],
    pricePerMonth: PLAN_PRICES[recommendedKey],
  }

  if (!company) {
    return {
      allowed: false,
      trialExpired: true,
      subscriptionStatus: null,
      activeHomesCount,
      recommendedPlan,
    }
  }

  const subscriptionStatus = company.subscriptionStatus ?? null

  // Active subscription: always allowed
  if (subscriptionStatus === "active") {
    return {
      allowed: true,
      trialExpired: false,
      subscriptionStatus,
      activeHomesCount,
      recommendedPlan,
    }
  }

  const now = new Date()
  const trialEndsAt = company.trialEndsAt ?? null
  let trialExpired = false

  if (subscriptionStatus === "trialing") {
    if (!trialEndsAt) {
      trialExpired = true
    } else {
      trialExpired = now >= trialEndsAt
    }
  } else if (!trialEndsAt) {
    // No subscription and no trial window => treat as expired
    trialExpired = true
  }

  const allowed = !trialExpired

  return {
    allowed,
    trialExpired,
    subscriptionStatus,
    activeHomesCount,
    recommendedPlan,
  }
}

