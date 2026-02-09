import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/super-admin"
import { createSuperAdminAuditLog } from "@/lib/audit"
import { z } from "zod"

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  status: z.enum(["INVITED", "ACTIVE", "DISABLED"]).optional(),
  role: z.enum(["Admin", "Superintendent", "Manager", "Subcontractor"]).optional(),
})

/**
 * PATCH /api/super-admin/users/:userId
 * Disable/enable user or change role. SUPER_ADMIN only. Audited.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error
  const actorId = check.id

  const { userId } = await params
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { company: { select: { name: true } } } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Cannot modify super-admin users" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors?.[0] || "Invalid input"
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const before = { isActive: user.isActive, status: user.status, role: user.role }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: parsed.data as never,
  })

  await createSuperAdminAuditLog(actorId, "USER_UPDATED_BY_SUPER_ADMIN", {
    userId,
    userEmail: user.email,
    companyId: user.companyId,
    before,
    after: { isActive: updated.isActive, status: updated.status, role: updated.role },
  }, user.companyId ?? undefined, "User", userId)

  return NextResponse.json(updated)
}
