import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/super-admin"
import { createSuperAdminAuditLog } from "@/lib/audit"
import { z } from "zod"
import { cookies } from "next/headers"

const bodySchema = z.object({ companyId: z.string(), userIdToImpersonate: z.string() })

const IMPERSONATION_COOKIE = "buildflow_impersonation"
const COOKIE_MAX_AGE = 60 * 60 * 8 // 8 hours

/**
 * POST /api/super-admin/impersonation/start
 * Set impersonation context (httpOnly cookie). SUPER_ADMIN only. Audited.
 */
export async function POST(req: Request) {
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error
  const actorId = check.id

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "companyId and userIdToImpersonate required" }, { status: 400 })
  }

  const { companyId, userIdToImpersonate } = parsed.data
  const user = await prisma.user.findUnique({
    where: { id: userIdToImpersonate },
    include: { company: { select: { id: true, name: true } } },
  })
  if (!user || user.companyId !== companyId) {
    return NextResponse.json({ error: "User not found or not in company" }, { status: 404 })
  }
  if (user.role !== "Admin" && user.role !== "Superintendent" && user.role !== "Manager") {
    return NextResponse.json({ error: "Can only impersonate Admin, Superintendent, or Manager" }, { status: 400 })
  }

  const payload = JSON.stringify({
    companyId: user.company!.id,
    companyName: user.company!.name,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    role: user.role,
  })

  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE, Buffer.from(payload).toString("base64"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  })

  await createSuperAdminAuditLog(actorId, "IMPERSONATION_STARTED", {
    targetUserId: userIdToImpersonate,
    targetUserEmail: user.email,
    companyId,
    companyName: user.company?.name,
  }, null, null, null)

  return NextResponse.json({ success: true, companyName: user.company?.name, userName: user.name })
}
