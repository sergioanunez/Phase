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
  orderedCategoryIds: z.array(z.string().min(1)),
})

const POS_START = 100
const POS_STEP = 100

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:write")

    const { orderedCategoryIds } = bodySchema.parse(await request.json())
    if (new Set(orderedCategoryIds).size !== orderedCategoryIds.length) {
      return NextResponse.json({ error: "Duplicate category ids" }, { status: 400 })
    }

    const all = await prisma.workTemplateCategory.findMany({
      where: { companyId: ctx.companyId },
      select: { id: true },
    })
    const allowed = new Set(all.map((c) => c.id))
    for (const id of orderedCategoryIds) {
      if (!allowed.has(id)) {
        return NextResponse.json({ error: `Invalid category id: ${id}` }, { status: 400 })
      }
    }

    const orderedSet = new Set(orderedCategoryIds)
    const missing = all.filter((c) => !orderedSet.has(c.id)).map((c) => c.id)
    const finalOrder = [...orderedCategoryIds, ...missing]

    await prisma.$transaction(
      finalOrder.map((id, index) =>
        prisma.workTemplateCategory.update({
          where: { id },
          data: { categoryPosition: POS_START + index * POS_STEP },
        })
      )
    )

    await recomputeGlobalSequenceForCompany(prisma, ctx.companyId)
    console.info("[work-template-categories/reorder] ok", {
      companyId: ctx.companyId,
      count: finalOrder.length,
    })
    return NextResponse.json({ ok: true, updated: finalOrder.length })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 })
    return handleApiError(e)
  }
}
