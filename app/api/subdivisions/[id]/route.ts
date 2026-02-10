import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePermission, requireTenantPermission } from "@/lib/rbac"
import { createAuditLog } from "@/lib/audit"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const updateSubdivisionSchema = z.object({
  name: z.string().min(1).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireTenantPermission("subdivisions:read")

    const subdivision = await prisma.subdivision.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
      include: {
        homes: { select: { id: true, addressOrLot: true } },
      },
    })

    if (!subdivision) {
      return NextResponse.json({ error: "Subdivision not found" }, { status: 404 })
    }

    return NextResponse.json(subdivision)
  } catch (error: any) {
    return handleApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requirePermission("subdivisions:write")
    const body = await request.json()
    const data = updateSubdivisionSchema.parse(body)

    const before = await prisma.subdivision.findUnique({
      where: { id: params.id },
    })

    if (!before) {
      return NextResponse.json(
        { error: "Subdivision not found" },
        { status: 404 }
      )
    }

    const after = await prisma.subdivision.update({
      where: { id: params.id },
      data: {
        name: data.name,
      },
    })

    await createAuditLog(
      user.id,
      "Subdivision",
      params.id,
      "UPDATE",
      before,
      after
    )

    return NextResponse.json(after)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || "Failed to update subdivision" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireTenantPermission("subdivisions:write")

    const before = await prisma.subdivision.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
      include: { homes: { select: { id: true } } },
    })

    if (!before) {
      return NextResponse.json({ error: "Subdivision not found" }, { status: 404 })
    }

    if (before.homes.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete subdivision. It has ${before.homes.length} home(s). Delete homes first.` },
        { status: 400 }
      )
    }

    await prisma.subdivision.delete({
      where: { id: params.id },
    })

    await createAuditLog(ctx.userId, "Subdivision", params.id, "DELETE", before, null, ctx.companyId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return handleApiError(error)
  }
}
