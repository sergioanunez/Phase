import {
  NotificationCategory,
  NotificationEntityType,
  NotificationSeverity,
  type PrismaClient,
} from "@prisma/client"
import { createNotification } from "@/lib/notifications"

export async function notifyTenantTaskReportedComplete(params: {
  prisma: PrismaClient
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  address: string
  contractorLabel: string
  reportingUserName: string
}) {
  const { prisma, companyId, homeId, taskId, taskName, address, contractorLabel, reportingUserName } =
    params

  const message = `${contractorLabel} reported “${taskName}” complete at ${address}. ${reportingUserName} submitted the report. Verify.`

  const assignments = await prisma.homeAssignment.findMany({
    where: { homeId },
    select: { superintendentUserId: true },
  })

  for (const a of assignments) {
    await createNotification({
      companyId,
      severity: NotificationSeverity.INFO,
      category: NotificationCategory.QUALITY,
      title: "Work reported complete",
      message,
      entityType: NotificationEntityType.TASK,
      entityId: taskId,
      homeId,
      targetRole: "SUPERINTENDENT",
      targetUserId: a.superintendentUserId,
      requiresAction: true,
    })
  }

  await createNotification({
    companyId,
    severity: NotificationSeverity.INFO,
    category: NotificationCategory.QUALITY,
    title: "Work reported complete",
    message,
    entityType: NotificationEntityType.TASK,
    entityId: taskId,
    homeId,
    targetRole: "MANAGER",
    requiresAction: true,
  })
}

export async function notifyTenantPunchReportedComplete(params: {
  prisma: PrismaClient
  companyId: string
  homeId: string
  punchId: string
  punchTitle: string
  address: string
  contractorLabel: string
  reportingUserName: string
}) {
  const {
    prisma,
    companyId,
    homeId,
    punchId,
    punchTitle,
    address,
    contractorLabel,
    reportingUserName,
  } = params

  const message = `${contractorLabel} reported punch “${punchTitle}” complete at ${address}. ${reportingUserName} submitted the report. Verify.`

  const assignments = await prisma.homeAssignment.findMany({
    where: { homeId },
    select: { superintendentUserId: true },
  })

  for (const a of assignments) {
    await createNotification({
      companyId,
      severity: NotificationSeverity.INFO,
      category: NotificationCategory.QUALITY,
      title: "Punch reported complete",
      message,
      entityType: NotificationEntityType.PUNCH,
      entityId: punchId,
      homeId,
      targetRole: "SUPERINTENDENT",
      targetUserId: a.superintendentUserId,
      requiresAction: true,
    })
  }

  await createNotification({
    companyId,
    severity: NotificationSeverity.INFO,
    category: NotificationCategory.QUALITY,
    title: "Punch reported complete",
    message,
    entityType: NotificationEntityType.PUNCH,
    entityId: punchId,
    homeId,
    targetRole: "MANAGER",
    requiresAction: true,
  })
}
