import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
})

/**
 * POST /api/super-admin/password
 * Change the current super admin's password.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireSuperAdmin } = await import("@/lib/super-admin")
    const { createSuperAdminAuditLog } = await import("@/lib/audit")

    const check = await requireSuperAdmin()
    if ("error" in check) return check.error

    const actorId = check.id
    const body = await request.json()
    const parsed = changePasswordSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors?.[0] || "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { currentPassword, newPassword } = parsed.data

    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, email: true, passwordHash: true },
    })

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: "Account not found or password cannot be changed." },
        { status: 400 }
      )
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!matches) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 })
    }

    const newHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: actorId },
      data: { passwordHash: newHash },
    })

    await createSuperAdminAuditLog(actorId, "SUPER_ADMIN_CHANGE_PASSWORD", {
      email: user.email,
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error("POST /api/super-admin/password error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to change password" },
      { status: 500 }
    )
  }
}

