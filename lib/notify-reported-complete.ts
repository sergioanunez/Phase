/**
 * Contractor-facing "report complete" → tenant bell notifications.
 * Policy: only Punch List–level completion notifies (not per item, not task report-complete).
 */

import { PunchStatus, type PrismaClient } from "@prisma/client"
import { notifyPunchListCompletedByContractor } from "@/lib/notificationRules"

/** @deprecated Policy: contractor task report-complete does not create bell notifications. */
export async function notifyTenantTaskReportedComplete(_params: {
  prisma: PrismaClient
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  address: string
  contractorLabel: string
  reportingUserName: string
}) {
  return null
}

/**
 * After a contractor reports one Punch Item complete, notify only when the whole
 * Punch List (or legacy task+contractor bucket) is fully reported/closed.
 * Idempotent via notificationRules upsert on punchListKey.
 */
export async function maybeNotifyPunchListCompleteAfterContractorReport(params: {
  prisma: PrismaClient
  companyId: string
  homeId: string
  homeLabel: string
  contractorLabel: string
  punchListId: string | null
  relatedHomeTaskId: string
  assignedContractorId: string | null
  taskIdForLink?: string | null
}) {
  const {
    prisma,
    companyId,
    homeId,
    homeLabel,
    contractorLabel,
    punchListId,
    relatedHomeTaskId,
    assignedContractorId,
    taskIdForLink,
  } = params

  const siblingWhere = punchListId
    ? {
        companyId,
        punchListId,
        status: { not: PunchStatus.Canceled },
      }
    : {
        companyId,
        relatedHomeTaskId,
        punchListId: null,
        assignedContractorId,
        status: { not: PunchStatus.Canceled },
      }

  const siblings = await prisma.punchItem.findMany({
    where: siblingWhere,
    select: {
      id: true,
      status: true,
      reportedCompleteAt: true,
    },
  })

  if (siblings.length === 0) return null

  const allDone = siblings.every(
    (i) =>
      i.status === PunchStatus.Closed ||
      i.reportedCompleteAt != null
  )
  if (!allDone) return null

  const punchListKey = punchListId
    ? punchListId
    : `legacy:${relatedHomeTaskId}:${assignedContractorId ?? "none"}`

  return notifyPunchListCompletedByContractor({
    companyId,
    homeId,
    punchListKey,
    taskId: taskIdForLink ?? relatedHomeTaskId,
    homeLabel,
    contractorName: contractorLabel,
  })
}

/**
 * @deprecated Per-item punch report notifications removed.
 * Use maybeNotifyPunchListCompleteAfterContractorReport.
 */
export async function notifyTenantPunchReportedComplete(params: {
  prisma: PrismaClient
  companyId: string
  homeId: string
  punchId: string
  punchTitle: string
  address: string
  contractorLabel: string
  reportingUserName: string
  punchListId?: string | null
  relatedHomeTaskId?: string
  assignedContractorId?: string | null
}) {
  if (!params.relatedHomeTaskId) return null
  return maybeNotifyPunchListCompleteAfterContractorReport({
    prisma: params.prisma,
    companyId: params.companyId,
    homeId: params.homeId,
    homeLabel: params.address,
    contractorLabel: params.contractorLabel,
    punchListId: params.punchListId ?? null,
    relatedHomeTaskId: params.relatedHomeTaskId,
    assignedContractorId: params.assignedContractorId ?? null,
    taskIdForLink: params.relatedHomeTaskId,
  })
}
