import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission } from "@/lib/rbac"
import { createAuditLog } from "@/lib/audit"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"
import bcrypt from "bcryptjs"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["Admin", "Superintendent", "Manager", "Subcontractor"]).optional(),
  contractorId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireTenantPermission("users:write")
    const body = await request.json()
    const data = updateUserSchema.parse(body)

    const before = await prisma.user.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
      include: {
        contractor: { select: { id: true, companyName: true } },
      },
    })

    if (!before) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (data.role === "Subcontractor" && data.contractorId === undefined && !before.contractorId) {
      return NextResponse.json(
        { error: "Subcontractor must be linked to a contractor company" },
        { status: 400 }
      )
    }

    if (data.role !== undefined && data.role !== "Subcontractor" && (data.contractorId !== undefined ? data.contractorId : before.contractorId)) {
      return NextResponse.json(
        { error: "Only Subcontractor role can have a contractor company" },
        { status: 400 }
      )
    }

    const updateData: {
      name?: string
      email?: string
      passwordHash?: string
      role?: "Admin" | "Superintendent" | "Manager" | "Subcontractor"
      contractorId?: string | null
      isActive?: boolean
    } = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email
    if (data.role !== undefined) updateData.role = data.role
    if (data.contractorId !== undefined) {
      if (data.contractorId) {
        const contractor = await prisma.contractor.findFirst({
          where: { id: data.contractorId, companyId: ctx.companyId },
        })
        if (!contractor) {
          return NextResponse.json({ error: "Contractor not found" }, { status: 400 })
        }
      }
      updateData.contractorId = data.contractorId
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.password !== undefined && data.password.length >= 6) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10)
    }

    const after = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      include: {
        contractor: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    })

    await createAuditLog(ctx.userId, "User", params.id, "UPDATE", {
      ...before,
      passwordHash: "[REDACTED]",
    }, {
      ...after,
      passwordHash: "[REDACTED]",
    })

    const { passwordHash: _, ...safeUser } = after
    return NextResponse.json(safeUser)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireTenantPermission("users:write")

    const before = await prisma.user.findFirst({
      where: { id: params.id, companyId: ctx.companyId },
      include: {
        contractor: { select: { id: true, companyName: true } },
      },
    })

    if (!before) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (before.role === "Admin") {
      return NextResponse.json({ error: "Admin users cannot be deleted" }, { status: 400 })
    }

    await prisma.user.delete({
      where: { id: params.id },
    })

    await createAuditLog(ctx.userId, "User", params.id, "DELETE", {
      ...before,
      passwordHash: "[REDACTED]",
    }, null, ctx.companyId)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
