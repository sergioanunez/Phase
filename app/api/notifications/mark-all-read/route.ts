import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const BUILDER_ROLES = ["Admin", "Manager", "Superintendent"]

export async function PATCH() {
  if (isBuildTime) return buildGuardResponse()
  try {
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { markAllNotificationsReadForUser, toNotificationTargetRole } = await import("@/lib/notifications")

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const ctx = await requireTenantContext()
    if (!ctx.companyId) {
      return NextResponse.json({ error: "No company context" }, { status: 403 })
    }
    if (!BUILDER_ROLES.includes(ctx.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const targetRole = toNotificationTargetRole(ctx.role)
    if (!targetRole) {
      return NextResponse.json({ count: 0 })
    }

    const result = await markAllNotificationsReadForUser(
      ctx.userId,
      targetRole,
      ctx.companyId
    )
    return NextResponse.json({ success: true, count: result.count })
  } catch (error: unknown) {
    console.error("PATCH /api/notifications/mark-all-read error:", error)
    return NextResponse.json({ error: "Failed to mark all as read" }, { status: 500 })
  }
}
