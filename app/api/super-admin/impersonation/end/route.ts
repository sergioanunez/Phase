import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/super-admin"
import { createSuperAdminAuditLog } from "@/lib/audit"
import { cookies } from "next/headers"

const IMPERSONATION_COOKIE = "buildflow_impersonation"

/**
 * POST /api/super-admin/impersonation/end
 * Clear impersonation cookie. SUPER_ADMIN only. Audited.
 */
export async function POST() {
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error
  const actorId = check.id

  const cookieStore = await cookies()
  const existing = cookieStore.get(IMPERSONATION_COOKIE)?.value
  let meta: Record<string, unknown> = {}
  if (existing) {
    try {
      const decoded = JSON.parse(Buffer.from(existing, "base64").toString("utf8"))
      meta = { endedImpersonationOf: decoded.userId, companyId: decoded.companyId }
    } catch {
      meta = {}
    }
  }

  cookieStore.delete(IMPERSONATION_COOKIE)

  await createSuperAdminAuditLog(actorId, "IMPERSONATION_ENDED", meta, null, null, null)

  return NextResponse.json({ success: true })
}
