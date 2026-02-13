import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { computeHomeForecast } from "@/lib/forecast"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * GET /api/homes/[id]/forecast
 * Recomputes forecast (longest dependency chain in working days from startDate),
 * persists to home + tasks, then returns the full home with tasks (same shape as GET /api/homes/[id]).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    const homeForAccess = await prisma.home.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
      include: {
        assignments: { select: { superintendentUserId: true } },
      },
    })

    if (!homeForAccess) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    if (ctx.role === "Superintendent") {
      const hasAccess = homeForAccess.assignments.some(
        (a) => a.superintendentUserId === ctx.userId
      )
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    await computeHomeForecast(params.id)

    const home = await prisma.home.findUnique({
      where: { id: params.id },
      include: {
        subdivision: true,
        tasks: {
          include: {
            contractor: true,
            templateItem: {
              select: {
                id: true,
                name: true,
                optionalCategory: true,
                isCriticalGate: true,
                gateName: true,
              },
            },
          },
          orderBy: { sortOrderSnapshot: "asc" },
        },
        assignments: {
          include: {
            superintendent: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    return NextResponse.json(home)
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Dependency cycle")) {
      return NextResponse.json(
        { error: error.message, forecastError: error.message },
        { status: 400 }
      )
    }
    return handleApiError(error)
  }
}
