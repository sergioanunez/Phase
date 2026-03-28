import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { listMergedHomePlans } from "@/lib/home-plans"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * GET /api/homes/:id/plans — list all plans (legacy primary + HomePlan rows), grouped metadata only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")

    const { id: homeId } = await Promise.resolve(params)
    const ctx = await requireTenantPermission("homes:read")

    const home = await prisma.home.findFirst({
      where: {
        id: homeId,
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
      where: { homeId },
      orderBy: { createdAt: "desc" },
    })

    const plans = listMergedHomePlans(home, rows)
    return NextResponse.json({ plans })
  } catch (error: unknown) {
    const status =
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined
    if (status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    console.error("Error listing home plans:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list plans" },
      { status: 500 }
    )
  }
}
