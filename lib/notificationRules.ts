/**
 * Rule engine for builder notifications (tenant-level only).
 * SUPERINTENDENT, MANAGER, ADMIN. No SUPER_ADMIN.
 * Dedup: same companyId + entityType + entityId + category + severity → update existing unresolved.
 *
 * Hook points (wired / TODO):
 * - notifyTaskScheduled: app/api/tasks/[id]/route.ts (PATCH when status → Scheduled)
 * - notifyTaskRescheduled: app/api/tasks/[id]/reschedule/route.ts
 * - notifyTaskCompleted: app/api/tasks/[id]/route.ts (PATCH when status → Completed)
 * - notifyPunchItemsAddedToTask: app/api/tasks/[id]/punch-items/route.ts (POST, one notification per task)
 * - notifySmsConfirmationReceived: lib/twilio.ts handleInboundSMS (when contractor replies Y/N)
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

/** One notification per task when punch items are added (not per punch item). */
export async function notifyPunchItemsAddedToTask(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  punchCount?: number
  createdByUserId?: string | null
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, taskId, taskName, homeLabel, punchCount, createdByUserId, targetRole = "ANY" } = params
  const countStr = punchCount != null && punchCount > 0 ? ` (${punchCount} ${punchCount === 1 ? "item" : "items"})` : ""
  const row = await upsertOrCreate({
    companyId,
    severity: "ATTENTION",
    category: "QUALITY",
    title: "Punch items added to task",
    message: `Punch items added to ${taskName} at ${homeLabel}${countStr}.`,
    entityType: "TASK",
    entityId: taskId,
    homeId,
    createdByUserId,
    targetRole,
    requiresAction: true,
  })
  const { dispatchWebPushPunchlist } = await import("@/lib/web-push-dispatch")
  dispatchWebPushPunchlist({
    companyId,
    homeId,
    taskId,
    taskName,
    homeLabel,
    title: "Punchlist updated",
    body: `New punch item${punchCount === 1 ? "" : "s"} on ${taskName} at ${homeLabel}.`,
    dedupSuffix: `add:${taskId}`,
  }).catch((err) => console.error("[push] notifyPunchItemsAddedToTask:", err))
  return row
}

export async function notifyPunchItemCompleted(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  punchItemId: string
  punchTitle: string
  targetRole?: NotificationTargetRole
}) {
  const {
    companyId,
    homeId,
    taskId,
    taskName,
    homeLabel,
    punchItemId,
    punchTitle,
    targetRole = "ANY",
  } = params
  const row = await upsertOrCreate({
    companyId,
    severity: "INFO",
    category: "QUALITY",
    title: "Punch item completed",
    message: `"${punchTitle}" was marked complete on ${taskName} at ${homeLabel}.`,
    entityType: "PUNCH",
    entityId: punchItemId,
    homeId,
    targetRole,
    requiresAction: false,
  })
  const { dispatchWebPushPunchlist } = await import("@/lib/web-push-dispatch")
  dispatchWebPushPunchlist({
    companyId,
    homeId,
    taskId,
    taskName,
    homeLabel,
    title: "Punchlist item completed",
    body: `"${punchTitle}" completed on ${taskName} at ${homeLabel}.`,
    dedupSuffix: `closed:${punchItemId}`,
  }).catch((err) => console.error("[push] notifyPunchItemCompleted:", err))
  return row
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

export async function notifySmsConfirmationReceived(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  confirmed: boolean
  targetRole?: NotificationTargetRole
}) {
  const { companyId, homeId, taskId, taskName, homeLabel, confirmed, targetRole = "ANY" } = params
  const row = await upsertOrCreate({
    companyId,
    severity: "INFO",
    category: "CONTRACTOR",
    title: confirmed ? "Task confirmed via SMS" : "Task declined via SMS",
    message: confirmed
      ? `${taskName} at ${homeLabel} was confirmed by the contractor.`
      : `${taskName} at ${homeLabel} was declined by the contractor.`,
    entityType: "TASK",
    entityId: taskId,
    homeId,
    targetRole,
    requiresAction: false,
  })
  const { dispatchWebPushSubcontractorReply } = await import("@/lib/web-push-dispatch")
  dispatchWebPushSubcontractorReply({
    companyId,
    homeId,
    taskId,
    taskName,
    homeLabel,
    confirmed,
  }).catch((err) => console.error("[push] notifySmsConfirmationReceived:", err))
  return row
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
