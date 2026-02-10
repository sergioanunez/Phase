import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePermission, requireTenantPermission } from "@/lib/rbac"
import { createAuditLog } from "@/lib/audit"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const updateContractorSchema = z.object({
  companyName: z.string().min(1).optional(),
  contactName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  trade: z.string().optional().nullable(),
  preferredNoticeDays: z.number().int().positive().optional().nullable(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requirePermission("contractors:write")
    const body = await request.json()
    const data = updateContractorSchema.parse(body)

    const before = await prisma.contractor.findUnique({
      where: { id: params.id },
    })

    if (!before) {
      return NextResponse.json(
        { error: "Contractor not found" },
        { status: 404 }
      )
    }

    const after = await prisma.contractor.update({
      where: { id: params.id },
      data: {
        companyName: data.companyName,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
        trade: data.trade,
        preferredNoticeDays: data.preferredNoticeDays,
      },
    })

    await createAuditLog(
      user.id,
      "Contractor",
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
      { error: error.message || "Failed to update contractor" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireTenantPermission("contractors:write")

    const before = await prisma.contractor.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
      include: {
        homeTasks: { select: { id: true } },
        users: { select: { id: true } },
      },
    })

    if (!before) {
      return NextResponse.json({ error: "Contractor not found" }, { status: 404 })
    }

    if (before.homeTasks.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete contractor. They have ${before.homeTasks.length} task(s) assigned. Remove tasks first.`,
        },
        { status: 400 }
      )
    }

    if (before.users.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete contractor. They have ${before.users.length} user account(s). Remove users first.`,
        },
        { status: 400 }
      )
    }

    await prisma.contractor.delete({
      where: { id: params.id },
    })

    await createAuditLog(ctx.userId, "Contractor", params.id, "DELETE", before, null, ctx.companyId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return handleApiError(error)
  }
}
