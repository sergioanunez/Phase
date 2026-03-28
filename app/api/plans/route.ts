import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { listMergedHomePlans } from "@/lib/home-plans"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * GET /api/plans?houseId=...
 * Same payload as GET /api/homes/:id/plans (alias for integrations).
 */
export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const houseId = request.nextUrl.searchParams.get("houseId")
    if (!houseId?.trim()) {
      return NextResponse.json({ error: "houseId query parameter is required" }, { status: 400 })
    }

    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")

    const ctx = await requireTenantPermission("homes:read")

    const home = await prisma.home.findFirst({
      where: {
        id: houseId.trim(),
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, subdivision: { companyId: ctx.companyId } },
        ],
      },
      include: {
        assignments: { select: { superintendentUserId: true } },
      },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    if (ctx.role === "Superintendent") {
      const hasAccess = home.assignments.some((a) => a.superintendentUserId === ctx.userId)
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const rows = await prisma.homePlan.findMany({
      where: { homeId: houseId.trim() },
      orderBy: { createdAt: "desc" },
    })

    const plans = listMergedHomePlans(home, rows)
    return NextResponse.json({ plans })
  } catch (error: unknown) {
    const status =
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: status === 401 ? "Unauthorized" : "Forbidden" },
        { status }
      )
    }
    console.error("GET /api/plans:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list plans" },
      { status: 500 }
    )
  }
}
