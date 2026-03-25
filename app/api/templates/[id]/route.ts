import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"
import { GateScope, GateBlockMode } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  defaultDurationDays: z.number().int().min(0).optional(),
  sortOrder: z.number().int().optional(),
  optionalCategory: z.string().optional().nullable(),
  workTemplateCategoryId: z.string().optional().nullable(),
  isDependency: z.boolean().optional(),
  isCriticalGate: z.boolean().optional(),
  gateScope: z.nativeEnum(GateScope).optional(),
  gateBlockMode: z.nativeEnum(GateBlockMode).optional(),
  gateName: z.string().optional().nullable(),
  prepLeadDays: z.number().int().min(0).optional(),
  requiresOrdering: z.boolean().optional(),
  materialLeadDays: z.number().int().min(0).optional(),
  contractorId: z.string().nullable().optional(),
  contractorLeadOverrideDays: z.number().int().min(0).nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
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
    if (isBuildTime) return buildGuardResponse()
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

    if (data.contractorId != null && data.contractorId !== "") {
      const contractor = await prisma.contractor.findFirst({
        where: { id: data.contractorId, companyId: ctx.companyId },
      })
      if (!contractor) {
        return NextResponse.json(
          { error: "Contractor not found or does not belong to this company" },
          { status: 400 }
        )
      }
    }

    const { ensureWorkTemplateCategoryByName, nextItemPosition, recomputeGlobalSequenceForCompany } =
      await import("@/lib/work-template-sequence")

    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.defaultDurationDays !== undefined) updateData.defaultDurationDays = data.defaultDurationDays
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder
    if (data.isDependency !== undefined) updateData.isDependency = data.isDependency
    if (data.isCriticalGate !== undefined) updateData.isCriticalGate = data.isCriticalGate
    if (data.gateScope !== undefined) updateData.gateScope = data.gateScope
    if (data.gateBlockMode !== undefined) updateData.gateBlockMode = data.gateBlockMode
    if (data.gateName !== undefined) updateData.gateName = data.gateName
    if (data.prepLeadDays !== undefined) updateData.prepLeadDays = data.prepLeadDays
    if (data.requiresOrdering !== undefined) updateData.requiresOrdering = data.requiresOrdering
    if (data.materialLeadDays !== undefined) updateData.materialLeadDays = data.materialLeadDays
    if (data.contractorId !== undefined) updateData.contractorId = data.contractorId
    if (data.contractorLeadOverrideDays !== undefined) updateData.contractorLeadOverrideDays = data.contractorLeadOverrideDays

    if (data.workTemplateCategoryId !== undefined && data.workTemplateCategoryId) {
      const cat = await prisma.workTemplateCategory.findFirst({
        where: { id: data.workTemplateCategoryId, companyId: ctx.companyId },
      })
      if (!cat) {
        return NextResponse.json({ error: "Category not found" }, { status: 400 })
      }
      updateData.workTemplateCategoryId = cat.id
      updateData.optionalCategory = cat.name
      updateData.itemPosition = await nextItemPosition(prisma, cat.id)
    } else if (data.workTemplateCategoryId !== undefined && !data.workTemplateCategoryId) {
      updateData.workTemplateCategoryId = null
      if (data.optionalCategory !== undefined) {
        updateData.optionalCategory = data.optionalCategory
      }
    } else if (data.optionalCategory !== undefined) {
      const cat = await ensureWorkTemplateCategoryByName(prisma, ctx.companyId, data.optionalCategory)
      updateData.workTemplateCategoryId = cat.id
      updateData.optionalCategory = cat.name
      updateData.itemPosition = await nextItemPosition(prisma, cat.id)
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const after = await prisma.workTemplateItem.update({
      where: { id: params.id },
      data: updateData,
    })

    await recomputeGlobalSequenceForCompany(prisma, ctx.companyId)

    const enriched = await prisma.workTemplateItem.findFirst({
      where: { id: params.id },
      include: {
        dependencies: {
          include: {
            dependsOnItem: { select: { id: true, name: true } },
          },
        },
        contractor: { select: { id: true, companyName: true, trade: true, leadDays: true } },
        workTemplateCategory: {
          select: { id: true, name: true, categoryPosition: true },
        },
      },
    })

    await createAuditLog(
      ctx.userId,
      "WorkTemplateItem",
      params.id,
      "UPDATE",
      before,
      enriched ?? after,
      ctx.companyId
    )

    return NextResponse.json(enriched ?? after)
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
    if (isBuildTime) return buildGuardResponse()
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
