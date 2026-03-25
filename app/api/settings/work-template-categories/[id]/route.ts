import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { recomputeGlobalSequenceForCompany } from "@/lib/work-template-sequence"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:write")

    const before = await prisma.workTemplateCategory.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
    })
    if (!before) return NextResponse.json({ error: "Category not found" }, { status: 404 })

    const data = patchSchema.parse(await request.json())
    if (!data.name) {
      return NextResponse.json({ error: "No updates" }, { status: 400 })
    }

    const newName = data.name.trim()
    if (newName !== before.name) {
      const clash = await prisma.workTemplateCategory.findFirst({
        where: { companyId: ctx.companyId, name: newName, NOT: { id: before.id } },
      })
      if (clash) {
        return NextResponse.json({ error: "Another category already uses this name." }, { status: 400 })
      }

      await prisma.$transaction(async (tx) => {
        await tx.categoryGate.updateMany({
          where: { companyId: ctx.companyId, categoryName: before.name },
          data: { categoryName: newName },
        })
        await tx.workTemplateItem.updateMany({
          where: { workTemplateCategoryId: before.id },
          data: { optionalCategory: newName },
        })
        await tx.workTemplateCategory.update({
          where: { id: before.id },
          data: { name: newName },
        })
      })
    }

    const row = await prisma.workTemplateCategory.findFirst({ where: { id: params.id } })
    await recomputeGlobalSequenceForCompany(prisma, ctx.companyId)
    return NextResponse.json(row)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 })
    return handleApiError(e)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:write")

    const cat = await prisma.workTemplateCategory.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
      include: { _count: { select: { templateItems: true } } },
    })
    if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 })
    if (cat._count.templateItems > 0) {
      return NextResponse.json(
        { error: "Move or delete work items in this category before deleting the category." },
        { status: 400 }
      )
    }

    await prisma.workTemplateCategory.delete({ where: { id: cat.id } })
    await recomputeGlobalSequenceForCompany(prisma, ctx.companyId)
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
