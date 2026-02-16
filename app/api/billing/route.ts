import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { PLANS } from "@/lib/stripe"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/billing
 * Returns subscription state, usage, and available plans for the billing page.
 */
export async function GET() {
  try {
    if (isBuildTime) return buildGuardResponse()
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
        }
      : null

    const plans = Object.values(PLANS).map((p) => ({
      planKey: p.planKey,
      label: p.label,
      priceLabel: p.priceLabel,
      maxActiveHomes: p.maxActiveHomes,
      whiteLabelEnabled: p.whiteLabelEnabled,
      stripePriceId: p.stripePriceId ? "set" : null,
    }))

    return NextResponse.json({
      subscription,
      usage: {
        activeHomesCount: usage.activeHomesCount,
        usersCount: usage.usersCount,
        maxActiveHomes: entitlements.maxActiveHomes,
        maxUsers: entitlements.maxUsers,
      },
      plans,
    })
  } catch (error: any) {
    if (error?.message === "Unauthorized" || error?.message === "Forbidden") {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 }
      )
    }
    console.error("GET /api/billing error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to load billing" },
      { status: 500 }
    )
  }
}
