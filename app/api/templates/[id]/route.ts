import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"
import { GateScope, GateBlockMode } from "@prisma/client"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  defaultDurationDays: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
  optionalCategory: z.string().optional().nullable(),
  isDependency: z.boolean().optional(),
  isCriticalGate: z.boolean().optional(),
  gateScope: z.nativeEnum(GateScope).optional(),
  gateBlockMode: z.nativeEnum(GateBlockMode).optional(),
  gateName: z.string().optional().nullable(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:read")

    const template = await prisma.workTemplateItem.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
    })

    if (!template) {
      return NextResponse.json({ error: "Template item not found" }, { status: 404 })
    }

    return NextResponse.json(template)
  } catch (error: any) {
    return handleApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("templates:write")
    const body = await request.json()
    const data = updateTemplateSchema.parse(body)

    const before = await prisma.workTemplateItem.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
    })

    if (!before) {
      return NextResponse.json(
        { error: "Template item not found" },
        { status: 404 }
      )
    }

    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.defaultDurationDays !== undefined) updateData.defaultDurationDays = data.defaultDurationDays
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder
    if (data.optionalCategory !== undefined) updateData.optionalCategory = data.optionalCategory
    if (data.isDependency !== undefined) updateData.isDependency = data.isDependency
    if (data.isCriticalGate !== undefined) updateData.isCriticalGate = data.isCriticalGate
    if (data.gateScope !== undefined) updateData.gateScope = data.gateScope
    if (data.gateBlockMode !== undefined) updateData.gateBlockMode = data.gateBlockMode
    if (data.gateName !== undefined) updateData.gateName = data.gateName

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      )
    }

    const after = await prisma.workTemplateItem.update({
      where: { id: params.id },
      data: updateData,
    })

    await createAuditLog(ctx.userId, "WorkTemplateItem", params.id, "UPDATE", before, after, ctx.companyId)

    return NextResponse.json(after)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("templates:write")

    const before = await prisma.workTemplateItem.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
      include: {
        homeTasks: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    })

    if (!before) {
      return NextResponse.json(
        { error: "Template item not found" },
        { status: 404 }
      )
    }

    if (before.homeTasks.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete template item. It is being used by existing tasks.",
        },
        { status: 400 }
      )
    }

    await prisma.workTemplateItem.delete({
      where: { id: params.id },
    })

    await createAuditLog(ctx.userId, "WorkTemplateItem", params.id, "DELETE", before, null, ctx.companyId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return handleApiError(error)
  }
}
