import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { sortWorkTemplatesForDisplay } from "@/lib/work-template-display-order"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const bodySchema = z.object({
  orderedTemplateIds: z.array(z.string().min(1)),
})

/**
 * POST /api/settings/work-items/order
 * Admin-only. Persists sequenceOrder with gaps (100, 200, ...).
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantAdmin } = await import("@/lib/rbac")
    const ctx = await requireTenantAdmin()

    const json = await request.json()
    const { orderedTemplateIds } = bodySchema.parse(json)

    if (orderedTemplateIds.length === 0) {
      return NextResponse.json({ error: "orderedTemplateIds must not be empty" }, { status: 400 })
    }
    if (new Set(orderedTemplateIds).size !== orderedTemplateIds.length) {
      return NextResponse.json({ error: "Duplicate template ids" }, { status: 400 })
    }

    const all = await prisma.workTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      select: {
        id: true,
        sequenceOrder: true,
        optionalCategory: true,
        sortOrder: true,
        name: true,
        createdAt: true,
      },
    })
    const allowed = new Set(all.map((t) => t.id))
    for (const id of orderedTemplateIds) {
      if (!allowed.has(id)) {
        return NextResponse.json({ error: `Invalid or out-of-tenant template id: ${id}` }, { status: 400 })
      }
    }

    const orderedSet = new Set(orderedTemplateIds)
    const missing = all.filter((t) => !orderedSet.has(t.id))
    const appended = sortWorkTemplatesForDisplay(missing).map((t) => t.id)
    const finalOrder = [...orderedTemplateIds, ...appended]

    const start = 100
    const increment = 100

    await prisma.$transaction(
      finalOrder.map((id, index) =>
        prisma.workTemplateItem.update({
          where: { id },
          data: { sequenceOrder: start + index * increment },
        })
      )
    )

    return NextResponse.json({ ok: true, updated: finalOrder.length })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    return handleApiError(error)
  }
}
