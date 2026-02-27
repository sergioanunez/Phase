import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/** POST /api/tasks/[id]/mark-ordered — set orderedAt for Flow "Mark ordered" quick action. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { hasPermission } = await import("@/lib/rbac")

    const ctx = await requireTenantContext()
    if (!hasPermission(ctx.role, "tasks:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const task = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, home: { companyId: ctx.companyId } },
        ],
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const updated = await prisma.homeTask.update({
      where: { id: params.id },
      data: { orderedAt: new Date() },
      include: {
        contractor: true,
        home: { include: { subdivision: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
