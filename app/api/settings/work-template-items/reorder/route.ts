import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { recomputeGlobalSequenceForCompany } from "@/lib/work-template-sequence"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const bodySchema = z.object({
  categoryId: z.string().min(1),
  orderedTemplateIds: z.array(z.string().min(1)),
})

const POS_START = 100
const POS_STEP = 100

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:write")

    const { categoryId, orderedTemplateIds } = bodySchema.parse(await request.json())
    if (new Set(orderedTemplateIds).size !== orderedTemplateIds.length) {
      return NextResponse.json({ error: "Duplicate template ids" }, { status: 400 })
    }

    const cat = await prisma.workTemplateCategory.findFirst({
      where: { id: categoryId, companyId: ctx.companyId },
    })
    if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 })

    const items = await prisma.workTemplateItem.findMany({
      where: { workTemplateCategoryId: categoryId, companyId: ctx.companyId },
      select: { id: true },
    })
    const inCat = new Set(items.map((t) => t.id))
    for (const id of orderedTemplateIds) {
      if (!inCat.has(id)) {
        return NextResponse.json(
          { error: `Template ${id} is not in this category` },
          { status: 400 }
        )
      }
    }
    if (orderedTemplateIds.length !== inCat.size) {
      return NextResponse.json({ error: "Order list must include every item in the category" }, { status: 400 })
    }

    const positions = orderedTemplateIds.map((_, i) => POS_START + i * POS_STEP)
    if (new Set(positions).size !== positions.length) {
      console.error("[work-template-items/reorder] duplicate positions")
    }

    await prisma.$transaction(
      orderedTemplateIds.map((id, index) =>
        prisma.workTemplateItem.update({
          where: { id },
          data: { itemPosition: POS_START + index * POS_STEP },
        })
      )
    )

    await recomputeGlobalSequenceForCompany(prisma, ctx.companyId)
    console.info("[work-template-items/reorder] ok", {
      companyId: ctx.companyId,
      categoryId,
      count: orderedTemplateIds.length,
    })
    return NextResponse.json({ ok: true, updated: orderedTemplateIds.length })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 })
    return handleApiError(e)
  }
}
