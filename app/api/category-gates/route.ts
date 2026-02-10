import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission } from "@/lib/rbac"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"
import { GateScope, GateBlockMode } from "@prisma/client"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const createCategoryGateSchema = z.object({
  categoryName: z.string().min(1),
  gateScope: z.nativeEnum(GateScope).optional(),
  gateBlockMode: z.nativeEnum(GateBlockMode).optional(),
  gateName: z.string().optional().nullable(),
})

const updateCategoryGateSchema = z.object({
  gateScope: z.nativeEnum(GateScope).optional(),
  gateBlockMode: z.nativeEnum(GateBlockMode).optional(),
  gateName: z.string().optional().nullable(),
})

// GET /api/category-gates - Get all category gates (tenant-scoped)
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("templates:read")

    const categoryGates = await prisma.categoryGate.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { categoryName: "asc" },
    })

    return NextResponse.json(categoryGates)
  } catch (error: any) {
    return handleApiError(error)
  }
}

// POST /api/category-gates - Create a new category gate (tenant-scoped)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("templates:write")
    const body = await request.json()
    const data = createCategoryGateSchema.parse(body)

    const categoryGate = await prisma.categoryGate.create({
      data: {
        companyId: ctx.companyId,
        categoryName: data.categoryName,
        gateScope: data.gateScope ?? GateScope.DownstreamOnly,
        gateBlockMode: data.gateBlockMode ?? GateBlockMode.ScheduleOnly,
        gateName: data.gateName || null,
      },
    })

    return NextResponse.json(categoryGate)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Category gate already exists for this category" },
        { status: 400 }
      )
    }
    return handleApiError(error)
  }
}

// DELETE /api/category-gates?categoryName=... - Delete a category gate (tenant-scoped)
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("templates:write")
    const { searchParams } = new URL(request.url)
    const categoryName = searchParams.get("categoryName")

    if (!categoryName) {
      return NextResponse.json(
        { error: "categoryName parameter is required" },
        { status: 400 }
      )
    }

    const gate = await prisma.categoryGate.findFirst({
      where: { companyId: ctx.companyId, categoryName },
    })
    if (!gate) {
      return NextResponse.json({ error: "Category gate not found" }, { status: 404 })
    }

    await prisma.categoryGate.delete({
      where: { id: gate.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Category gate not found" }, { status: 404 })
    }
    return handleApiError(error)
  }
}
