import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission, requireRole } from "@/lib/rbac"
import { createAuditLog } from "@/lib/audit"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"
import bcrypt from "bcryptjs"

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["Admin", "Superintendent", "Manager", "Subcontractor"]),
  contractorId: z.string().optional().nullable(),
})

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("users:read")

    const users = await prisma.user.findMany({
      where: { companyId: ctx.companyId },
      include: {
        contractor: { select: { id: true, companyName: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    const safeUsers = users.map(({ passwordHash, ...user }) => user)
    return NextResponse.json(safeUsers)
  } catch (error: any) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("users:write")
    const body = await request.json()
    const data = createUserSchema.parse(body)

    // Validate contractorId if role is Subcontractor
    if (data.role === "Subcontractor" && !data.contractorId) {
      return NextResponse.json(
        { error: "Subcontractor must be linked to a contractor company" },
        { status: 400 }
      )
    }

    if (data.role !== "Subcontractor" && data.contractorId) {
      return NextResponse.json(
        { error: "Only Subcontractor role can have contractorId" },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(data.password, 10)

    const newUser = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        contractorId: data.contractorId,
        companyId: ctx.companyId,
        isActive: true,
      },
      include: {
        contractor: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    })

    await createAuditLog(ctx.userId, "User", newUser.id, "CREATE", null, {
      ...newUser,
      passwordHash: "[REDACTED]",
    })

    const { passwordHash: _, ...safeUser } = newUser
    return NextResponse.json(safeUser, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 })
    }
    return handleApiError(error)
  }
}
