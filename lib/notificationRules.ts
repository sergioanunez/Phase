/**
 * Rule engine for builder notifications (tenant-level only).
 * SUPERINTENDENT, MANAGER, ADMIN. No SUPER_ADMIN.
 * Dedup: same companyId + entityType + entityId + category + severity → update existing unresolved.
 *
 * Hook points (wired / TODO):
 * - notifyTaskScheduled: app/api/tasks/[id]/route.ts (PATCH when status → Scheduled)
 * - notifyTaskRescheduled: app/api/tasks/[id]/reschedule/route.ts
 * - notifyTaskCompleted: app/api/tasks/[id]/route.ts (PATCH when status → Completed)
 * - notifyPunchAdded: app/api/tasks/[id]/punch-items/route.ts (POST)
 * - notifyForecastSlip: app/api/homes/[id]/forecast/route.ts (when forecast date moves out)
 * - TODO notifyTaskOverdue: call from cron or schedule view when task.scheduledDate < today and status not Completed (e.g. app/api/calendar/events/route.ts or a daily job)
 * - TODO notifyConfirmationMissing: call from cron for tasks in PendingConfirm for > X hours (e.g. app/api/tasks/[id]/send-confirmation/route.ts or a scheduled job)
 * - TODO notifyIdleHome: call from cron or dashboard when home has no activity for > 48h (e.g. app/api/dashboard/portfolio/route.ts or lib/schedule-status.ts)
 */

import {
  NotificationSeverity,
  NotificationCategory,
  NotificationEntityType,
  NotificationTargetRole,
} from "@prisma/client"
import { prisma } from "./prisma"
import { createNotification, type CreateNotificationData } from "./notifications"

const BUILDERS_ROLES: NotificationTargetRole[] = ["SUPERINTENDENT", "MANAGER", "ADMIN"]

async function upsertOrCreate(data: CreateNotificationData) {
  const key = {
    companyId: data.companyId,
    entityType: data.entityType,
    entityId: data.entityId ?? null,
    category: data.category,
    severity: data.severity,
    resolvedAt: null,
  }
  const existing = await prisma.notification.findFirst({
    where: key,
    orderBy: { createdAt: "desc" },
  })
  if (existing) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        message: data.message,
        homeId: data.homeId ?? existing.homeId,
        requiresAction: data.requiresAction ?? existing.requiresAction,
        expiresAt: data.expiresAt ?? existing.expiresAt,
      },
    })
    return existing
  }
  return createNotification(data)
}

export async function notifyTaskScheduled(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  scheduledDate: Date
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, taskId, taskName, homeLabel, scheduledDate, targetRole = "ANY" } = params
  const dateStr = scheduledDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  return upsertOrCreate({
    companyId,
    severity: "INFO",
    category: "SCHEDULE",
    title: "Task scheduled",
    message: `${taskName} at ${homeLabel} scheduled for ${dateStr}.`,
    entityType: "TASK",
    entityId: taskId,
    homeId,
    targetRole,
    requiresAction: false,
  })
}

export async function notifyTaskRescheduled(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  isCriticalPath?: boolean
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, taskId, taskName, homeLabel, isCriticalPath, targetRole = "ANY" } = params
  const severity: NotificationSeverity = isCriticalPath ? "CRITICAL" : "INFO"
  return upsertOrCreate({
    companyId,
    severity,
    category: "SCHEDULE",
    title: isCriticalPath ? "Critical path task rescheduled" : "Task rescheduled",
    message: `${taskName} at ${homeLabel} was rescheduled.${isCriticalPath ? " This task is on the critical path." : ""}`,
    entityType: "TASK",
    entityId: taskId,
    homeId,
    targetRole,
    requiresAction: isCriticalPath,
  })
}

export async function notifyTaskCompleted(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, taskId, taskName, homeLabel, targetRole = "ANY" } = params
  return upsertOrCreate({
    companyId,
    severity: "INFO",
    category: "SCHEDULE",
    title: "Task completed",
    message: `${taskName} at ${homeLabel} has been marked complete.`,
    entityType: "TASK",
    entityId: taskId,
    homeId,
    targetRole,
    requiresAction: false,
  })
}

export async function notifyPunchAdded(params: {
  companyId: string
  homeId: string
  punchId: string
  taskId: string
  punchTitle: string
  homeLabel: string
  createdByUserId?: string | null
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, punchId, taskId, punchTitle, homeLabel, createdByUserId, targetRole = "ANY" } = params
  return upsertOrCreate({
    companyId,
    severity: "ATTENTION",
    category: "QUALITY",
    title: "Punch item added",
    message: `"${punchTitle}" at ${homeLabel}.`,
    entityType: "PUNCH",
    entityId: punchId,
    homeId,
    createdByUserId,
    targetRole,
    requiresAction: true,
  })
}

export async function notifyTaskOverdue(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  scheduledDate: Date
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, taskId, taskName, homeLabel, scheduledDate, targetRole = "ANY" } = params
  const dateStr = scheduledDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return upsertOrCreate({
    companyId,
    severity: "CRITICAL",
    category: "SCHEDULE",
    title: "Task overdue",
    message: `${taskName} at ${homeLabel} was scheduled for ${dateStr} and is now overdue.`,
    entityType: "TASK",
    entityId: taskId,
    homeId,
    targetRole,
    requiresAction: true,
  })
}

export async function notifyConfirmationMissing(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  hoursPending: number
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, taskId, taskName, homeLabel, hoursPending, targetRole = "ANY" } = params
  return upsertOrCreate({
    companyId,
    severity: "ATTENTION",
    category: "CONTRACTOR",
    title: "Confirmation pending",
    message: `${taskName} at ${homeLabel} has been waiting for contractor confirmation for ${hoursPending}+ hours.`,
    entityType: "TASK",
    entityId: taskId,
    homeId,
    targetRole,
    requiresAction: true,
  })
}

export async function notifyForecastSlip(params: {
  companyId: string
  homeId: string
  homeLabel: string
  previousForecast: Date
  newForecast: Date
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, homeLabel, previousForecast, newForecast, targetRole = "ANY" } = params
  const prevStr = previousForecast.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  const newStr = newForecast.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  return upsertOrCreate({
    companyId,
    severity: "CRITICAL",
    category: "SCHEDULE",
    title: "Forecast slipped",
    message: `${homeLabel} forecast moved from ${prevStr} to ${newStr}.`,
    entityType: "HOME",
    entityId: homeId,
    homeId,
    targetRole,
    requiresAction: true,
  })
}

export async function notifyIdleHome(params: {
  companyId: string
  homeId: string
  homeLabel: string
  hoursIdle: number
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, homeLabel, hoursIdle, targetRole = "ANY" } = params
  return upsertOrCreate({
    companyId,
    severity: "CRITICAL",
    category: "SCHEDULE",
    title: "Home idle",
    message: `${homeLabel} has had no scheduled activity for ${hoursIdle}+ hours.`,
    entityType: "HOME",
    entityId: homeId,
    homeId,
    targetRole,
    requiresAction: true,
  })
}
