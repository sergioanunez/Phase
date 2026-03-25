import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { nextCategoryPosition, recomputeGlobalSequenceForCompany } from "@/lib/work-template-sequence"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const createSchema = z.object({
  name: z.string().min(1).max(200),
})

export async function GET() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:read")

    const rows = await prisma.workTemplateCategory.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ categoryPosition: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { templateItems: true } },
      },
    })

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        categoryPosition: r.categoryPosition,
        itemCount: r._count.templateItems,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    )
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:write")
    const body = createSchema.parse(await request.json())

    const name = body.name.trim()
    const existing = await prisma.workTemplateCategory.findUnique({
      where: { companyId_name: { companyId: ctx.companyId, name } },
    })
    if (existing) {
      return NextResponse.json({ error: "A category with this name already exists." }, { status: 400 })
    }

    const pos = await nextCategoryPosition(prisma, ctx.companyId)
    const row = await prisma.workTemplateCategory.create({
      data: { companyId: ctx.companyId, name, categoryPosition: pos },
    })

    await recomputeGlobalSequenceForCompany(prisma, ctx.companyId)

    return NextResponse.json(row, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 })
    return handleApiError(e)
  }
}
