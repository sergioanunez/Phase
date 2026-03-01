import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { recommendPlan, PLAN_LIMITS, PLAN_PRICES, type BillingPlanKey } from "@/lib/billing/recommendation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  if (isBuildTime) return buildGuardResponse()
  try {
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { getTenantUsage } = await import("@/lib/entitlements")

    const ctx = await requireTenantContext()
    const tenantId = ctx.companyId

    const [company, usage] = await Promise.all([
      prisma.company.findFirst({
        where: { id: tenantId },
        select: {
          id: true,
          status: true,
          subscriptionStatus: true,
          trialStartsAt: true,
          trialEndsAt: true,
          planKey: true,
          stripeSubscriptionId: true,
        },
      }),
      getTenantUsage(prisma, tenantId),
    ])

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const now = new Date()
    const subscriptionStatus = company.subscriptionStatus ?? null
    const isTrialingStatus = subscriptionStatus === "trialing"
    // Treat company.status === "TRIAL" as trialing so trial UI shows even if subscriptionStatus wasn't set
    const isTrialCompany = company.status === "TRIAL" || isTrialingStatus
    let trialEndsAt = company.trialEndsAt ?? null
    if (!trialEndsAt && isTrialCompany && company.trialStartsAt) {
      const end = new Date(company.trialStartsAt)
      end.setDate(end.getDate() + 30)
      trialEndsAt = end
    }

    let remainingTrialDays: number | null = null
    let trialActive = false
    let trialExpired = false
    if (trialEndsAt) {
      const msRemaining = trialEndsAt.getTime() - now.getTime()
      remainingTrialDays = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)))
      trialActive = isTrialCompany && msRemaining > 0
      trialExpired = isTrialCompany && msRemaining <= 0
    } else if (isTrialCompany) {
      trialExpired = true
    }

    const activeHomesCount = usage.activeHomesCount
    const recommendedKey: BillingPlanKey = recommendPlan(activeHomesCount)
    const recommended = {
      planKey: recommendedKey,
      maxActiveHomes: PLAN_LIMITS[recommendedKey],
      pricePerMonth: PLAN_PRICES[recommendedKey],
    }

    // So trial banner shows: when we treat as trial company, expose as trialing
    const effectiveSubscriptionStatus = isTrialCompany ? "trialing" : subscriptionStatus
    const canRestoreTrial =
      company.status !== "TRIAL" && !subscriptionStatus && !company.stripeSubscriptionId

    return NextResponse.json({
      tenantId,
      subscriptionStatus: effectiveSubscriptionStatus,
      companyStatus: company.status,
      canRestoreTrial,
      trialStartsAt: company.trialStartsAt,
      trialEndsAt,
      remainingTrialDays,
      trialActive,
      trialExpired,
      activeHomesCount,
      recommendedPlan: recommended,
    })
  } catch (error: any) {
    if (error?.message === "Unauthorized" || error?.message === "Forbidden") {
      return NextResponse.json(
        { error: error.message },
        { status: error?.message === "Unauthorized" ? 401 : 403 }
      )
    }
    console.error("GET /api/billing/status error:", error)
    return NextResponse.json({ error: "Unable to load billing status" }, { status: 500 })
  }
}

