import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"
import { GateScope, GateBlockMode } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const createTemplateSchema = z.object({
  name: z.string().min(1),
  defaultDurationDays: z.number().int().positive(),
  sortOrder: z.number().int(),
  optionalCategory: z.string().optional().nullable(),
  workTemplateCategoryId: z.string().optional().nullable(),
  isDependency: z.boolean().optional(),
  isCriticalGate: z.boolean().optional(),
  gateScope: z.nativeEnum(GateScope).optional(),
  gateBlockMode: z.nativeEnum(GateBlockMode).optional(),
  gateName: z.string().optional().nullable(),
})

export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:read")

    const { workTemplatePrismaOrderBy } = await import("@/lib/work-template-display-order")
    const templates = await prisma.workTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [...workTemplatePrismaOrderBy()],
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

    return NextResponse.json(templates)
  } catch (error: any) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("templates:write")
    const body = await request.json()
    const data = createTemplateSchema.parse(body)

    const {
      ensureWorkTemplateCategoryByName,
      nextItemPosition,
      recomputeGlobalSequenceForCompany,
    } = await import("@/lib/work-template-sequence")

    let workTemplateCategoryId = data.workTemplateCategoryId?.trim() || null
    let categoryNameForItem: string

    if (workTemplateCategoryId) {
      const cat = await prisma.workTemplateCategory.findFirst({
        where: { id: workTemplateCategoryId, companyId: ctx.companyId },
      })
      if (!cat) {
        return NextResponse.json({ error: "Category not found" }, { status: 400 })
      }
      categoryNameForItem = cat.name
    } else {
      const cat = await ensureWorkTemplateCategoryByName(
        prisma,
        ctx.companyId,
        data.optionalCategory
      )
      workTemplateCategoryId = cat.id
      categoryNameForItem = cat.name
    }

    const itemPosition = await nextItemPosition(prisma, workTemplateCategoryId)

    const template = await prisma.workTemplateItem.create({
      data: {
        companyId: ctx.companyId,
        name: data.name,
        defaultDurationDays: data.defaultDurationDays,
        sortOrder: data.sortOrder,
        sequenceOrder: null,
        optionalCategory: categoryNameForItem,
        workTemplateCategoryId,
        itemPosition,
        isDependency: data.isDependency || false,
        isCriticalGate: data.isCriticalGate || false,
        gateScope: data.gateScope ?? GateScope.DownstreamOnly,
        gateBlockMode: data.gateBlockMode ?? GateBlockMode.ScheduleOnly,
        gateName: data.gateName || null,
      },
    })

    await recomputeGlobalSequenceForCompany(prisma, ctx.companyId)

    const withRelations = await prisma.workTemplateItem.findFirst({
      where: { id: template.id },
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
      template.id,
      "CREATE",
      null,
      withRelations ?? template,
      ctx.companyId
    )

    return NextResponse.json(withRelations ?? template, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
