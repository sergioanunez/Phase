import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { displayOrdersFromIds } from "@/lib/display-order"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  orderedHomeIds: z.array(z.string().min(1)).min(1),
})

/**
 * PATCH /api/subdivisions/[id]/homes/order
 * Persist manual home order within a subdivision.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:write")

    const { id: subdivisionId } = await params
    const subdivision = await prisma.subdivision.findFirst({
      where: { id: subdivisionId, companyId: ctx.companyId },
      select: { id: true },
    })
    if (!subdivision) {
      return NextResponse.json({ error: "Subdivision not found" }, { status: 404 })
    }

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] ?? "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { orderedHomeIds } = parsed.data
    const uniqueIds = new Set(orderedHomeIds)
    if (uniqueIds.size !== orderedHomeIds.length) {
      return NextResponse.json({ error: "Duplicate home IDs in order list" }, { status: 400 })
    }

    const homesInSub = await prisma.home.findMany({
      where: {
        subdivisionId,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, subdivision: { companyId: ctx.companyId } },
        ],
      },
      select: { id: true },
    })
    const validIds = new Set(homesInSub.map((h) => h.id))

    if (orderedHomeIds.length !== validIds.size) {
      return NextResponse.json(
        { error: "Order list must include every home in this subdivision exactly once" },
        { status: 400 }
      )
    }
    for (const id of orderedHomeIds) {
      if (!validIds.has(id)) {
        return NextResponse.json({ error: "Invalid home for this subdivision" }, { status: 400 })
      }
    }

    const orders = displayOrdersFromIds(orderedHomeIds)
    await prisma.$transaction(
      orders.map(({ id, displayOrder }) =>
        prisma.home.update({
          where: { id },
          data: { displayOrder },
        })
      )
    )

    return NextResponse.json({ success: true, orderedHomeIds })
  } catch (error) {
    return handleApiError(error)
  }
}
