import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

/**
 * GET /api/billing/usage
 * Returns current tenant usage and limits for the billing meter.
 * Scoped to authenticated tenant.
 */
export async function GET() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { getTenantEntitlements, getTenantUsage } = await import("@/lib/entitlements")

    const ctx = await requireTenantContext()
    const tenantId = ctx.companyId

    const [entitlements, usage] = await Promise.all([
      getTenantEntitlements(prisma, tenantId),
      getTenantUsage(prisma, tenantId),
    ])

    return NextResponse.json({
      activeHomesCount: usage.activeHomesCount,
      usersCount: usage.usersCount,
      maxActiveHomes: entitlements.maxActiveHomes,
      maxUsers: entitlements.maxUsers,
    })
  } catch (error: any) {
    if (error?.message === "Unauthorized" || error?.message === "Forbidden") {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 }
      )
    }
    console.error("GET /api/billing/usage error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to load usage" },
      { status: 500 }
    )
  }
}
