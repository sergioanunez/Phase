import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission } from "@/lib/rbac"
import { handleApiError } from "@/lib/api-response"

// Avoid build-time execution (no DB/auth on Vercel build)
export const dynamic = "force-dynamic"

interface TaskActivity {
  id: string
  action: string
  actionType: "scheduled" | "confirmed" | "completed" | "other"
  userName: string
  houseAddress: string
  subdivision: string
  taskName: string
  timestamp: string
  previousStatus?: string
  newStatus?: string
  homeId?: string
  homeLabel?: string
}

export async function GET(request: NextRequest) {
  try {
    // Skip DB/auth during Vercel build (no session or DB available)
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return NextResponse.json([])
    }
    const ctx = await requireTenantPermission("tasks:read")

    // Get last 10 audit logs for HomeTask entities (tenant-scoped)
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        companyId: ctx.companyId,
        entityType: "HomeTask",
        action: {
          in: ["UPDATE", "CANCEL_SCHEDULE"],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    })

    // Get all task IDs from audit logs (filter out null entityId)
    const taskIds = auditLogs
      .map((log) => log.entityId)
      .filter((id): id is string => id != null)

    // Fetch all tasks in one query
    const tasks = await prisma.homeTask.findMany({
      where: {
        id: {
          in: taskIds,
        },
      },
      include: {
        home: {
          include: {
            subdivision: true,
          },
        },
      },
    })

    // Create a map for quick lookup
    const taskMap = new Map(tasks.map((task) => [task.id, task]))

    // Process audit logs
    const activities: TaskActivity[] = []

    for (const log of auditLogs) {
      try {
        // Parse the before and after JSON
        const before = log.beforeJson ? JSON.parse(log.beforeJson) : null
        const after = log.afterJson ? JSON.parse(log.afterJson) : null

        if (!after) continue
        const entityId = log.entityId
        if (entityId === null || entityId === undefined) continue
        // entityId is string here; look up task (satisfies strict TypeScript)
        const task = taskMap.get(entityId)
        if (!task) continue

        // Determine action type based on status changes
        let actionType: "scheduled" | "confirmed" | "completed" | "other" = "other"
        let action = "Updated"

        if (log.action === "CANCEL_SCHEDULE") {
          action = "Cancelled schedule"
          actionType = "other"
        } else if (before && after) {
          const beforeStatus = before.status
          const afterStatus = after.status

          if (beforeStatus !== afterStatus) {
            if (afterStatus === "Scheduled" && beforeStatus === "Unscheduled") {
              action = "Scheduled"
              actionType = "scheduled"
            } else if (afterStatus === "Confirmed" && beforeStatus === "PendingConfirm") {
              action = "Confirmed"
              actionType = "confirmed"
            } else if (afterStatus === "Completed") {
              action = "Completed"
              actionType = "completed"
            } else {
              action = `Status changed to ${afterStatus}`
            }
          } else if (after.scheduledDate && !before.scheduledDate) {
            action = "Scheduled"
            actionType = "scheduled"
          }
        }

        activities.push({
          id: log.id,
          action,
          actionType,
          userName: log.user?.name ?? "Unknown",
          houseAddress: task.home.addressOrLot,
          subdivision: task.home.subdivision.name,
          taskName: task.nameSnapshot,
          timestamp: log.createdAt.toISOString(),
          previousStatus: before?.status,
          newStatus: after?.status,
          homeId: task.home.id,
          homeLabel: task.home.addressOrLot,
        })
      } catch (error) {
        console.error(`Error processing audit log ${log.id}:`, error)
        continue
      }
    }

    return NextResponse.json(activities)
  } catch (error: any) {
    console.error("Failed to fetch recent activity:", error)
    return handleApiError(error)
  }
}
