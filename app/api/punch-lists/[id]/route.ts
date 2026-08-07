import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { handleApiError } from "@/lib/api-response"
import {
  punchListInclude,
  updatePunchList,
  updatePunchListBodySchema,
} from "@/lib/punch/punch-list"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/** GET /api/punch-lists/[id] */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    const list = await prisma.punchList.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
      include: punchListInclude,
    })
    if (!list) {
      return NextResponse.json({ error: "Punch list not found" }, { status: 404 })
    }
    return NextResponse.json(list)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

/** PATCH /api/punch-lists/[id] — update contractor / due date (cascades to items). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("tasks:write")
    const body = updatePunchListBodySchema.parse(await request.json())

    const before = await prisma.punchList.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
    })
    if (!before) {
      return NextResponse.json({ error: "Punch list not found" }, { status: 404 })
    }

    const updated = await prisma.$transaction(async (tx) =>
      updatePunchList({
        tx,
        companyId: ctx.companyId,
        punchListId: params.id,
        assignedContractorId: body.assignedContractorId,
        dueDate: body.dueDate,
      })
    )

    await createAuditLog(
      ctx.userId,
      "PunchList",
      updated.id,
      "UPDATE",
      before,
      updated,
      ctx.companyId
    )

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
