import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const BUILDER_ROLES = ["Admin", "Manager", "Superintendent"]

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (isBuildTime) return buildGuardResponse()
  try {
    const { id } = await params
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { markNotificationRead } = await import("@/lib/notifications")

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const ctx = await requireTenantContext()
    if (!ctx.companyId) {
      return NextResponse.json({ error: "No company context" }, { status: 403 })
    }

    if (BUILDER_ROLES.includes(ctx.role)) {
      const updated = await markNotificationRead(id, ctx.companyId)
      if (!updated) {
        return NextResponse.json({ error: "Notification not found" }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }

    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      const { fetchSubcontractorActivityNotifications } = await import("@/lib/subcontractor-activity-notifications")
      const { prisma } = await import("@/lib/prisma")
      const { markActivityNotificationRead } = await import("@/lib/activity-notification-read")
      const items = await fetchSubcontractorActivityNotifications(prisma, ctx.companyId, ctx.contractorId)
      if (!items.some((n) => n.id === id)) {
        return NextResponse.json({ error: "Notification not found" }, { status: 404 })
      }
      await markActivityNotificationRead(ctx.userId, ctx.companyId, id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  } catch (error: unknown) {
    console.error("PATCH /api/notifications/[id]/read error:", error)
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 })
  }
}
