import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/super-admin"
import { createSuperAdminAuditLog } from "@/lib/audit"
import bcrypt from "bcryptjs"
import { z } from "zod"

const createAdminUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

/**
 * POST /api/companies/[id]/admin-user
 * Create an Admin user for a company. SUPER_ADMIN only. Audited.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireSuperAdmin()
    if ("error" in check) return check.error
    const actorId = check.id

    const { id: companyId } = await params
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const body = await req.json()
    const parsed = createAdminUserSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] || "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { name, email, password } = parsed.data
    const emailLower = email.trim().toLowerCase()

    const existing = await prisma.user.findUnique({ where: { email: emailLower } })
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: emailLower,
        passwordHash,
        role: "Admin",
        status: "ACTIVE",
        companyId,
        isActive: true,
      },
    })

    await createSuperAdminAuditLog(actorId, "ADMIN_USER_CREATED", {
      companyId,
      userId: user.id,
      email: user.email,
      name: user.name,
    }, companyId, "User", user.id)

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    })
  } catch (e) {
    console.error("POST /api/companies/[id]/admin-user error:", e)
    return NextResponse.json({ error: "Failed to create admin user" }, { status: 500 })
  }
}
