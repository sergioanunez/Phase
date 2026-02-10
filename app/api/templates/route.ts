import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"
import { GateScope, GateBlockMode } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

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
    if (isBuild()) return NextResponse.json([], { status: 200 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
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
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
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
