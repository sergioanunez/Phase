import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { handleApiError } from "@/lib/api-response"
import {
  addItemToPunchList,
  addPunchListItemBodySchema,
} from "@/lib/punch/punch-list"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * POST /api/punch-lists/[id]/items
 * Add a PunchItem to an existing PunchList (online, idempotent via clientPunchItemId).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("tasks:write")
    const body = addPunchListItemBodySchema.parse(await request.json())

    const result = await prisma.$transaction(async (tx) =>
      addItemToPunchList({
        tx,
        companyId: ctx.companyId,
        actorUserId: ctx.userId,
        punchListId: params.id,
        title: body.title,
        description: body.description,
        clientPunchItemId: body.clientPunchItemId,
      })
    )

    if (result.created) {
      await createAuditLog(
        ctx.userId,
        "PunchItem",
        result.item.id,
        "CREATE",
        null,
        {
          id: result.item.id,
          punchListId: params.id,
          title: result.item.title,
        },
        ctx.companyId
      )
    }

    return NextResponse.json(result.item, { status: result.created ? 201 : 200 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
