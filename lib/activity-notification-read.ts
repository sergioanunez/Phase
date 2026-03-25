import { prisma } from "@/lib/prisma"

export async function getActivityReadKeys(userId: string, companyId: string, activityKeys: string[]): Promise<Set<string>> {
  if (activityKeys.length === 0) return new Set()
  const rows = await prisma.activityNotificationRead.findMany({
    where: {
      userId,
      companyId,
      activityKey: { in: activityKeys },
    },
    select: { activityKey: true },
  })
  return new Set(rows.map((r) => r.activityKey))
}

export async function markActivityNotificationRead(userId: string, companyId: string, activityKey: string) {
  return prisma.activityNotificationRead.upsert({
    where: {
      userId_activityKey: { userId, activityKey },
    },
    create: { userId, companyId, activityKey },
    update: { readAt: new Date() },
  })
}

export async function markAllActivityNotificationsRead(userId: string, companyId: string, activityKeys: string[]) {
  if (activityKeys.length === 0) return { count: 0 }
  const result = await prisma.activityNotificationRead.createMany({
    data: activityKeys.map((activityKey) => ({ userId, companyId, activityKey })),
    skipDuplicates: true,
  })
  return { count: result.count }
}
