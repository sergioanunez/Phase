/**
 * Server-only notification utilities.
 * Always scope by companyId (tenant). No SUPER_ADMIN logic.
 */

import {
  NotificationSeverity,
  NotificationCategory,
  NotificationEntityType,
  NotificationTargetRole,
} from "@prisma/client"
import { prisma } from "./prisma"

export type { NotificationSeverity, NotificationCategory, NotificationEntityType, NotificationTargetRole }

export interface CreateNotificationData {
  companyId: string
  severity: NotificationSeverity
  category: NotificationCategory
  title: string
  message: string
  entityType: NotificationEntityType
  entityId?: string | null
  homeId?: string | null
  createdByUserId?: string | null
  targetRole: NotificationTargetRole
  targetUserId?: string | null
  requiresAction?: boolean
  expiresAt?: Date | null
}

const severityOrder: Record<NotificationSeverity, number> = {
  CRITICAL: 0,
  ATTENTION: 1,
  INFO: 2,
}

export async function createNotification(data: CreateNotificationData) {
  return prisma.notification.create({
    data: {
      companyId: data.companyId,
      severity: data.severity,
      category: data.category,
      title: data.title,
      message: data.message,
      entityType: data.entityType,
      entityId: data.entityId ?? null,
      homeId: data.homeId ?? null,
      createdByUserId: data.createdByUserId ?? null,
      targetRole: data.targetRole,
      targetUserId: data.targetUserId ?? null,
      requiresAction: data.requiresAction ?? false,
      expiresAt: data.expiresAt ?? null,
    },
  })
}

export async function markReviewed(notificationId: string, userId: string) {
  const n = await prisma.notification.findFirst({
    where: { id: notificationId },
    select: { companyId: true },
  })
  if (!n) return null
  return prisma.notification.update({
    where: { id: notificationId },
    data: { reviewedAt: new Date() },
  })
}

export async function resolveNotification(notificationId: string, userId: string) {
  const n = await prisma.notification.findFirst({
    where: { id: notificationId },
    select: { companyId: true },
  })
  if (!n) return null
  return prisma.notification.update({
    where: { id: notificationId },
    data: { resolvedAt: new Date() },
  })
}

/** Map builder UserRole to NotificationTargetRole for filtering. */
export function toNotificationTargetRole(role: string): NotificationTargetRole | null {
  switch (role) {
    case "Superintendent":
      return "SUPERINTENDENT"
    case "Manager":
      return "MANAGER"
    case "Admin":
      return "ADMIN"
    default:
      return null
  }
}

export interface ListNotificationsForUserOptions {
  userId: string
  role: NotificationTargetRole
  companyId: string
  onlyRequiresAction?: boolean
  category?: NotificationCategory
}

export async function listNotificationsForUser(options: ListNotificationsForUserOptions) {
  const { userId, role, companyId, onlyRequiresAction, category } = options
  const now = new Date()

  const where: Parameters<typeof prisma.notification.findMany>[0]["where"] = {
    companyId,
    resolvedAt: null,
    OR: [
      { targetUserId: userId },
      { targetRole: role },
      { targetRole: "ANY" },
    ],
    AND: [
      {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    ],
  }

  if (onlyRequiresAction) {
    where.requiresAction = true
  }
  if (category) {
    where.category = category
  }

  const list = await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  })

  list.sort((a, b) => {
    const sev = severityOrder[a.severity] - severityOrder[b.severity]
    if (sev !== 0) return sev
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return list
}
