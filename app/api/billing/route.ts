import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { PLAN_CONFIG } from "@/lib/stripe"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Fallback plans when DB fails so the billing page still renders. */
function getPlansPayload() {
  return Object.values(PLAN_CONFIG).map((p) => ({
    planKey: p.planKey,
    label: p.label,
    priceLabel: p.priceLabel,
    maxActiveHomes: p.maxActiveHomes === -1 ? null : p.maxActiveHomes,
    maxUsers: p.maxUsers === -1 ? null : p.maxUsers,
    whiteLabelEnabled: p.whiteLabelEnabled,
    stripePriceId: p.stripePriceId ? "set" : null,
  }))
}

/**
 * GET /api/billing
 * Returns subscription state, usage, and available plans for the billing page.
 * On DB/schema errors returns 200 with fallback data so the page still loads and plan cards work.
 */
export async function GET() {
  if (isBuildTime) return buildGuardResponse()
  try {
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { getTenantEntitlements, getTenantUsage } = await import("@/lib/entitlements")

    const ctx = await requireTenantContext()
    const tenantId = ctx.companyId

    const [company, entitlements, usage] = await Promise.all([
      prisma.company.findFirst({
        where: { id: tenantId },
        select: {
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          subscriptionStatus: true,
          planKey: true,
          currentPeriodEnd: true,
          status: true,
          pricingTier: true,
        },
      }),
      getTenantEntitlements(prisma, tenantId),
      getTenantUsage(prisma, tenantId),
    ])

    const subscription = company
      ? {
          hasCustomer: !!company.stripeCustomerId,
          subscriptionStatus: company.subscriptionStatus ?? null,
          planKey: company.planKey ?? null,
          currentPeriodEnd: company.currentPeriodEnd?.toISOString() ?? null,
          companyStatus: company.status,
          pricingTier: company.pricingTier ?? null,
          whiteLabelEnabled: entitlements.whiteLabelEnabled,
        }
      : null

    return NextResponse.json({
      subscription,
      usage: {
        activeHomesCount: usage.activeHomesCount,
        usersCount: usage.usersCount,
        maxActiveHomes: entitlements.maxActiveHomes,
        maxUsers: entitlements.maxUsers,
      },
      plans: getPlansPayload(),
    })
  } catch (error: any) {
    if (error?.message === "Unauthorized" || error?.message === "Forbidden") {
      return NextResponse.json(
        { error: error.message },
        { status: error?.message === "Unauthorized" ? 401 : 403 }
      )
    }
    console.error("GET /api/billing error:", error)
    // Return 200 with fallback so billing page still loads (e.g. missing DB columns in production)
    return NextResponse.json({
      subscription: null,
      usage: {
        activeHomesCount: 0,
        usersCount: 0,
        maxActiveHomes: null,
        maxUsers: null,
      },
      plans: getPlansPayload(),
      error: error?.message || "Subscription and usage could not be loaded. You can still subscribe below.",
    })
  }
}
