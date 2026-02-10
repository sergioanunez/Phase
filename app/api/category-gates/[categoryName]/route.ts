import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"
import { GateScope, GateBlockMode } from "@prisma/client"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const updateCategoryGateSchema = z.object({
  gateScope: z.nativeEnum(GateScope).optional(),
  gateBlockMode: z.nativeEnum(GateBlockMode).optional(),
  gateName: z.string().optional().nullable(),
})

// PATCH /api/category-gates/[categoryName] - Update a category gate (tenant-scoped)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { categoryName: string } }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("templates:write")
    const body = await request.json()
    const data = updateCategoryGateSchema.parse(body)

    const categoryName = decodeURIComponent(params.categoryName)
    const gate = await prisma.categoryGate.findFirst({
      where: { companyId: ctx.companyId, categoryName },
    })
    if (!gate) {
      return NextResponse.json({ error: "Category gate not found" }, { status: 404 })
    }

    const updateData: { gateScope?: GateScope; gateBlockMode?: GateBlockMode; gateName?: string | null } = {}
    if (data.gateScope !== undefined) updateData.gateScope = data.gateScope
    if (data.gateBlockMode !== undefined) updateData.gateBlockMode = data.gateBlockMode
    if (data.gateName !== undefined) updateData.gateName = data.gateName

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const categoryGate = await prisma.categoryGate.update({
      where: { id: gate.id },
      data: updateData,
    })

    return NextResponse.json(categoryGate)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Category gate not found" }, { status: 404 })
    }
    return handleApiError(error)
  }
}
