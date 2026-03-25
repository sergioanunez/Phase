import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export interface NotificationItem {
  id: string
  type: "task_scheduled" | "task_confirmed" | "task_completed" | "task_cancelled" | "task_rescheduled" | "punch_added"
  title: string
  subtitle: string
  homeId: string
  homeLabel: string
  taskId?: string
  taskName?: string
  punchId?: string
  punchTitle?: string
  timestamp: string
  userName: string
  /** Subcontractor activity feed: marked read via ActivityNotificationRead */
  read?: boolean
}

const BUILDER_ROLES = ["Admin", "Manager", "Superintendent"]

export async function GET(request: NextRequest) {
  if (isBuildTime) return buildGuardResponse()
  try {
    const { requireTenantContext } = await import("@/lib/tenant")
    const { prisma } = await import("@/lib/prisma")
    const { listNotificationsForUser, toNotificationTargetRole } = await import("@/lib/notifications")

    const ctx = await requireTenantContext()
    const companyId = ctx.companyId!

    if (BUILDER_ROLES.includes(ctx.role)) {
      const targetRole = toNotificationTargetRole(ctx.role)
      if (!targetRole) {
        return NextResponse.json({ kind: "hierarchy", notifications: [], count: 0 })
      }
      const list = await listNotificationsForUser({
        userId: ctx.userId,
        role: targetRole,
        companyId,
      })
      const count = list.filter((n) => !n.reviewedAt).length
      return NextResponse.json({ kind: "hierarchy", notifications: list, count })
    }

    /**
     * Activity feed is only for subcontractors. Builder roles already returned hierarchy notifications above.
     */
    if (ctx.role !== "Subcontractor") {
      return NextResponse.json({ kind: "activity", notifications: [], count: 0 })
    }
    if (!ctx.contractorId) {
      return NextResponse.json({ kind: "activity", notifications: [], count: 0 })
    }

    const { fetchSubcontractorActivityNotifications } = await import("@/lib/subcontractor-activity-notifications")
    const { getActivityReadKeys } = await import("@/lib/activity-notification-read")

    const allItems = await fetchSubcontractorActivityNotifications(prisma, companyId, ctx.contractorId)
    const allIds = allItems.map((n) => n.id)
    const readSet = await getActivityReadKeys(ctx.userId, companyId, allIds)
    const unreadCount = allItems.filter((n) => !readSet.has(n.id)).length

    const withRead: NotificationItem[] = allItems.map((n) => ({
      ...n,
      read: readSet.has(n.id),
    }))
    const slice = withRead.slice(0, 50)

    return NextResponse.json({ kind: "activity", notifications: slice, count: unreadCount })
  } catch (error: unknown) {
    console.error("Failed to fetch notifications:", error)
    if (isBuildTime) return buildGuardResponse()
    // Return empty notifications so layout/pages still load (e.g. missing Notification table in DB)
    return NextResponse.json({ kind: "activity", notifications: [], count: 0 })
  }
}
