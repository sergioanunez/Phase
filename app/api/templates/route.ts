import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission } from "@/lib/rbac"
import { createAuditLog } from "@/lib/audit"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"
import { GateScope, GateBlockMode } from "@prisma/client"

const createTemplateSchema = z.object({
  name: z.string().min(1),
  defaultDurationDays: z.number().int().positive(),
  sortOrder: z.number().int(),
  optionalCategory: z.string().optional().nullable(),
  isDependency: z.boolean().optional(),
  isCriticalGate: z.boolean().optional(),
  gateScope: z.nativeEnum(GateScope).optional(),
  gateBlockMode: z.nativeEnum(GateBlockMode).optional(),
  gateName: z.string().optional().nullable(),
})

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("templates:read")

    const templates = await prisma.workTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { sortOrder: "asc" },
      include: {
        dependencies: {
          include: {
            dependsOnItem: { select: { id: true, name: true } },
          },
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
    const ctx = await requireTenantPermission("templates:write")
    const body = await request.json()
    const data = createTemplateSchema.parse(body)

    const template = await prisma.workTemplateItem.create({
      data: {
        companyId: ctx.companyId,
        name: data.name,
        defaultDurationDays: data.defaultDurationDays,
        sortOrder: data.sortOrder,
        optionalCategory: data.optionalCategory,
        isDependency: data.isDependency || false,
        isCriticalGate: data.isCriticalGate || false,
        gateScope: data.gateScope ?? GateScope.DownstreamOnly,
        gateBlockMode: data.gateBlockMode ?? GateBlockMode.ScheduleOnly,
        gateName: data.gateName || null,
      },
    })

    await createAuditLog(ctx.userId, "WorkTemplateItem", template.id, "CREATE", null, template, ctx.companyId)

    return NextResponse.json(template, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
