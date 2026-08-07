/**
 * Builder in-app + web-push notification policy (tenant-scoped).
 *
 * RETAIN (contractor-driven only):
 * - notifyTaskConfirmedByContractor — SMS / magic-link schedule confirmation
 * - notifyTaskRescheduleRequestedByContractor — contractor unavailable / wants new date
 * - notifyPunchListCompletedByContractor — contractor finished/submitted a Punch List
 *
 * SUPPRESSED (no-ops; Activity/audit may still record the action):
 * - schedule / internal reschedule / internal complete
 * - punch item created / completed by internals
 * - forecast slip, overdue, idle, confirmation-missing TODOs
 * - contractor "report task complete" (not a schedule confirmation)
 *
 * Dedup: unresolved row with same companyId + entityType + entityId + category + severity
 * is updated instead of duplicated (upsertOrCreate).
 */

import { type NotificationTargetRole } from "@prisma/client"
import { prisma } from "./prisma"
import { createNotification, type CreateNotificationData } from "./notifications"

export const TASK_RESCHEDULE_REQUEST_ENTITY_PREFIX = "task-reschedule-request:"

export function taskRescheduleRequestEntityId(taskId: string): string {
  return `${TASK_RESCHEDULE_REQUEST_ENTITY_PREFIX}${taskId}`
}

export function parseTaskIdFromNotificationEntityId(
  entityType: string,
  entityId: string | null | undefined
): string | null {
  if (!entityId) return null
  if (entityType === "TASK") {
    if (entityId.startsWith(TASK_RESCHEDULE_REQUEST_ENTITY_PREFIX)) {
      return entityId.slice(TASK_RESCHEDULE_REQUEST_ENTITY_PREFIX.length) || null
    }
    if (!entityId.includes(":")) return entityId
  }
  return null
}

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

/** @deprecated Policy: internal schedule actions do not create bell notifications. */
export async function notifyTaskScheduled(_params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  scheduledDate: Date
  targetRole?: NotificationTargetRole
}) {
  return null
}

/** @deprecated Policy: internal reschedule does not create bell notifications. */
export async function notifyTaskRescheduled(_params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  isCriticalPath?: boolean
  targetRole?: NotificationTargetRole
}) {
  return null
}

/** @deprecated Policy: internal task completion does not create bell notifications. */
export async function notifyTaskCompleted(_params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  targetRole?: NotificationTargetRole
}) {
  return null
}

/** @deprecated Policy: punch create does not create bell notifications. */
export async function notifyPunchItemsAddedToTask(_params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  punchCount?: number
  createdByUserId?: string | null
  targetRole?: NotificationTargetRole
}) {
  return null
}

/** @deprecated Policy: per-item punch complete does not create bell notifications. */
export async function notifyPunchItemCompleted(_params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  punchItemId: string
  punchTitle: string
  targetRole?: NotificationTargetRole
}) {
  return null
}

/** @deprecated Not wired; kept as no-op under noise policy. */
export async function notifyTaskOverdue(_params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  scheduledDate: Date
  targetRole?: NotificationTargetRole
}) {
  return null
}

/** @deprecated Not wired; kept as no-op under noise policy. */
export async function notifyConfirmationMissing(_params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  hoursPending: number
  targetRole?: NotificationTargetRole
}) {
  return null
}

/** @deprecated Policy: forecast slip does not create bell notifications. */
export async function notifyForecastSlip(_params: {
  companyId: string
  homeId: string
  homeLabel: string
  previousForecast: Date
  newForecast: Date
  targetRole?: NotificationTargetRole
}) {
  return null
}

/** @deprecated Not wired; kept as no-op under noise policy. */
export async function notifyIdleHome(_params: {
  companyId: string
  homeId: string
  homeLabel: string
  hoursIdle: number
  targetRole?: NotificationTargetRole
}) {
  return null
}

/**
 * Contractor confirmed a scheduled task via SMS / magic link.
 * Dedup entity: TASK + taskId + CONTRACTOR + INFO
 */
export async function notifyTaskConfirmedByContractor(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  contractorName: string
  confirmed: boolean
  targetRole?: NotificationTargetRole
}) {
  const {
    companyId,
    homeId,
    taskId,
    taskName,
    homeLabel,
    contractorName,
    confirmed,
    targetRole = "ANY",
  } = params

  if (!confirmed) return null

  const contractor = contractorName.trim() || "Contractor"
  const row = await upsertOrCreate({
    companyId,
    severity: "INFO",
    category: "CONTRACTOR",
    title: "Task confirmed",
    message: `${contractor} confirmed ${taskName} at ${homeLabel}.`,
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
    confirmed: true,
    contractorName: contractor,
  }).catch((err) => console.error("[push] notifyTaskConfirmedByContractor:", err))

  return row
}

/**
 * Contractor requested a reschedule (SMS N / magic-link Unavailable, or future explicit request).
 * Dedup entity: TASK + task-reschedule-request:{id} + CONTRACTOR + ATTENTION
 */
export async function notifyTaskRescheduleRequestedByContractor(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  contractorName: string
  /** Optional proposed date from contractor (when available). */
  proposedDate?: Date | string | null
  /** Stable request id when a dedicated RescheduleRequest exists; defaults to taskId. */
  rescheduleRequestId?: string | null
  targetRole?: NotificationTargetRole
}) {
  const {
    companyId,
    homeId,
    taskId,
    taskName,
    homeLabel,
    contractorName,
    proposedDate,
    rescheduleRequestId,
    targetRole = "ANY",
  } = params

  const contractor = contractorName.trim() || "Contractor"
  const requestKey = (rescheduleRequestId ?? taskId).trim() || taskId
  const entityId = taskRescheduleRequestEntityId(requestKey)

  let dateLabel: string | null = null
  if (proposedDate) {
    const d = typeof proposedDate === "string" ? new Date(proposedDate) : proposedDate
    if (!Number.isNaN(d.getTime())) {
      dateLabel = d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    }
  }

  const message = dateLabel
    ? `${contractor} requested ${dateLabel} for ${taskName} at ${homeLabel}.`
    : `${contractor} requested a new date for ${taskName} at ${homeLabel}.`

  const row = await upsertOrCreate({
    companyId,
    severity: "ATTENTION",
    category: "CONTRACTOR",
    title: "Reschedule requested",
    message,
    entityType: "TASK",
    entityId,
    homeId,
    targetRole,
    requiresAction: true,
  })

  const { dispatchWebPushRescheduleRequest } = await import("@/lib/web-push-dispatch")
  dispatchWebPushRescheduleRequest({
    companyId,
    homeId,
    taskId,
    taskName,
    homeLabel,
    contractorName: contractor,
    proposedDateLabel: dateLabel,
    dedupSuffix: requestKey,
  }).catch((err) => console.error("[push] notifyTaskRescheduleRequestedByContractor:", err))

  return row
}

/** @deprecated Prefer notifyTaskConfirmedByContractor / notifyTaskRescheduleRequestedByContractor. */
export async function notifySmsConfirmationReceived(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  confirmed: boolean
  contractorName?: string
  targetRole?: NotificationTargetRole
}) {
  if (params.confirmed) {
    return notifyTaskConfirmedByContractor({
      ...params,
      contractorName: params.contractorName ?? "Contractor",
    })
  }
  return notifyTaskRescheduleRequestedByContractor({
    ...params,
    contractorName: params.contractorName ?? "Contractor",
  })
}

/**
 * Contractor completed/submitted an entire Punch List (list-level, not per item).
 * Dedup entity: PUNCH + punchListKey + QUALITY + INFO
 */
export async function notifyPunchListCompletedByContractor(params: {
  companyId: string
  homeId: string
  punchListKey: string
  taskId?: string | null
  homeLabel: string
  contractorName: string
  targetRole?: NotificationTargetRole
}) {
  const {
    companyId,
    homeId,
    punchListKey,
    taskId,
    homeLabel,
    contractorName,
    targetRole = "ANY",
  } = params

  const contractor = contractorName.trim() || "Contractor"
  const row = await upsertOrCreate({
    companyId,
    severity: "INFO",
    category: "QUALITY",
    title: "Punch list completed",
    message: `${contractor} completed the punch list at ${homeLabel}.`,
    entityType: "PUNCH",
    entityId: punchListKey,
    homeId,
    targetRole,
    requiresAction: true,
  })

  if (taskId) {
    const { dispatchWebPushPunchlist } = await import("@/lib/web-push-dispatch")
    dispatchWebPushPunchlist({
      companyId,
      homeId,
      taskId,
      taskName: "Punch list",
      homeLabel,
      title: "Punch list completed",
      body: `${contractor} completed the punch list at ${homeLabel}.`,
      dedupSuffix: `list-complete:${punchListKey}`,
    }).catch((err) => console.error("[push] notifyPunchListCompletedByContractor:", err))
  }

  return row
}

export { upsertOrCreate as upsertOrCreateNotificationForTests }
