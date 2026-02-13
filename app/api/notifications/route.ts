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
}

/** Start of "today" window: last 24 hours (server UTC). For strict calendar day use APP_TIMEZONE elsewhere. */
function getRecentSince(): Date {
  const since = new Date()
  since.setUTCHours(since.getUTCHours() - 24)
  return since
}

export async function GET(request: NextRequest) {
  if (isBuildTime) return buildGuardResponse()
  try {
    const { requireTenantContext } = await import("@/lib/tenant")
    const { prisma } = await import("@/lib/prisma")
    const { handleApiError } = await import("@/lib/api-response")

    const ctx = await requireTenantContext()
    const since = getRecentSince()

    // Resolve which home IDs this user should see notifications for
    let allowedHomeIds: string[] | null = null // null = all homes in tenant
    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { superintendentUserId: ctx.userId, companyId: ctx.companyId },
        select: { homeId: true },
      })
      allowedHomeIds = assignments.map((a) => a.homeId)
      if (allowedHomeIds.length === 0) {
        return NextResponse.json({ notifications: [], count: 0 })
      }
    } else if (ctx.role === "Subcontractor" && ctx.contractorId) {
      const assignments = await prisma.contractorAssignment.findMany({
        where: { contractorId: ctx.contractorId, companyId: ctx.companyId },
        select: { homeId: true },
      })
      allowedHomeIds = assignments.map((a) => a.homeId)
      if (allowedHomeIds.length === 0) {
        return NextResponse.json({ notifications: [], count: 0 })
      }
    }
    // Manager, Admin, or other: allowedHomeIds stays null => all homes

    const companyId = ctx.companyId!

    const [taskLogs, punchLogs] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          companyId,
          entityType: "HomeTask",
          action: { in: ["UPDATE", "CANCEL_SCHEDULE"] },
          createdAt: { gte: since },
        },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.auditLog.findMany({
        where: {
          companyId,
          entityType: "PunchItem",
          action: "CREATE",
          createdAt: { gte: since },
        },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ])

    const taskIds = [...new Set(taskLogs.map((l) => l.entityId).filter(Boolean))] as string[]
    const punchIds = [...new Set(punchLogs.map((l) => l.entityId).filter(Boolean))] as string[]

    const [tasks, punchItems] = await Promise.all([
      taskIds.length > 0
        ? prisma.homeTask.findMany({
            where: { id: { in: taskIds } },
            include: { home: { select: { id: true, addressOrLot: true, subdivision: { select: { name: true } } } } },
          })
        : [],
      punchIds.length > 0
        ? prisma.punchItem.findMany({
            where: { id: { in: punchIds } },
            include: { relatedHomeTask: { select: { nameSnapshot: true } }, home: { select: { id: true, addressOrLot: true } } },
          })
        : [],
    ])

    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    const punchMap = new Map(punchItems.map((p) => [p.id, p]))

    const notifications: NotificationItem[] = []

    for (const log of taskLogs) {
      const task = log.entityId ? taskMap.get(log.entityId) : undefined
      if (!task || !task.home) continue
      if (allowedHomeIds !== null && !allowedHomeIds.includes(task.homeId)) continue

      const before = log.beforeJson ? (JSON.parse(log.beforeJson) as Record<string, unknown>) : null
      const after = log.afterJson ? (JSON.parse(log.afterJson) as Record<string, unknown>) : null
      const userName = log.user?.name ?? "Someone"

      let type: NotificationItem["type"] = "task_rescheduled"
      let title = "Task updated"

      if (log.action === "CANCEL_SCHEDULE") {
        type = "task_cancelled"
        title = "Schedule cancelled"
      } else if (before && after) {
        const beforeStatus = before.status as string | undefined
        const afterStatus = after.status as string | undefined
        const beforeDate = before.scheduledDate
        const afterDate = after.scheduledDate

        if (beforeStatus !== afterStatus) {
          if (afterStatus === "Scheduled" && beforeStatus === "Unscheduled") {
            type = "task_scheduled"
            title = "Task scheduled"
          } else if (afterStatus === "Confirmed" && beforeStatus === "PendingConfirm") {
            type = "task_confirmed"
            title = "Task confirmed"
          } else if (afterStatus === "Completed") {
            type = "task_completed"
            title = "Task completed"
          } else if (afterStatus === "Canceled" || afterStatus === "Cancelled") {
            type = "task_cancelled"
            title = "Task cancelled"
          } else {
            title = `Status: ${afterStatus}`
          }
        } else if (afterDate !== beforeDate && (afterDate || beforeDate)) {
          type = "task_rescheduled"
          title = "Task rescheduled"
        }
      }

      notifications.push({
        id: log.id,
        type,
        title,
        subtitle: `${task.nameSnapshot} · ${task.home.addressOrLot}`,
        homeId: task.home.id,
        homeLabel: task.home.addressOrLot,
        taskId: task.id,
        taskName: task.nameSnapshot,
        timestamp: log.createdAt.toISOString(),
        userName,
      })
    }

    for (const log of punchLogs) {
      const punch = log.entityId ? punchMap.get(log.entityId) : undefined
      if (!punch || !punch.home) continue
      if (allowedHomeIds !== null && !allowedHomeIds.includes(punch.homeId)) continue

      notifications.push({
        id: `punch-${log.id}`,
        type: "punch_added",
        title: "Punch item added",
        subtitle: `${punch.title} · ${punch.home.addressOrLot}${punch.relatedHomeTask ? ` · ${punch.relatedHomeTask.nameSnapshot}` : ""}`,
        homeId: punch.home.id,
        homeLabel: punch.home.addressOrLot,
        taskId: punch.relatedHomeTaskId,
        punchId: punch.id,
        punchTitle: punch.title,
        timestamp: log.createdAt.toISOString(),
        userName: log.user?.name ?? "Someone",
      })
    })

    notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const slice = notifications.slice(0, 50)

    return NextResponse.json({ notifications: slice, count: slice.length })
  } catch (error: unknown) {
    console.error("Failed to fetch notifications:", error)
    if (isBuildTime) return buildGuardResponse()
    try {
      const { handleApiError } = await import("@/lib/api-response")
      return handleApiError(error)
    } catch {
      return NextResponse.json({ notifications: [], count: 0 })
    }
  }
}
