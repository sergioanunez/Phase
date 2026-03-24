import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    const home = await prisma.home.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, subdivision: { companyId: ctx.companyId } },
        ],
      },
      select: { id: true },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const limitParam = request.nextUrl.searchParams.get("limit")
    const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200)

    const rows = await prisma.taskRescheduleHistory.findMany({
      where: { homeId: params.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        task: { select: { id: true, nameSnapshot: true } },
        rescheduledBy: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ items: rows })
  } catch (error: unknown) {
    const { handleApiError } = await import("@/lib/api-response")
    return handleApiError(error)
  }
}
