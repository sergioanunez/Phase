import type { PrismaClient, TaskConfirmationSource } from "@prisma/client"

export type ApplyConfirmationResult =
  | { ok: true; taskId: string; status: "Confirmed" | "Declined" }
  | { ok: false; error: string; statusCode: number }

/**
 * Apply Confirm or Unavailable to a PendingConfirm task.
 * Shared by inbound SMS Y/N (single pending) and magic-link page actions.
 */
export async function applyTaskConfirmationResponse(
  prisma: PrismaClient,
  params: {
    taskId: string
    confirmed: boolean
    source: TaskConfirmationSource
    /** Optional scope checks for magic-link (tenant + still PendingConfirm). */
    expectedCompanyId?: string | null
  }
): Promise<ApplyConfirmationResult> {
  const task = await prisma.homeTask.findUnique({
    where: { id: params.taskId },
    include: {
      contractor: { select: { companyName: true } },
      home: { select: { id: true, addressOrLot: true, companyId: true } },
    },
  })

  if (!task) {
    return { ok: false, error: "Confirmation not found", statusCode: 404 }
  }

  if (task.status !== "PendingConfirm") {
    return { ok: false, error: "This confirmation is no longer pending", statusCode: 409 }
  }

  const companyId = task.companyId ?? task.home?.companyId ?? null
  if (params.expectedCompanyId && companyId !== params.expectedCompanyId) {
    return { ok: false, error: "Confirmation not found", statusCode: 404 }
  }

  if (params.confirmed) {
    await prisma.homeTask.update({
      where: { id: task.id },
      data: {
        status: "Confirmed",
        confirmedAt: new Date(),
        confirmedByUserId: null,
        confirmationSource: params.source,
      },
    })
  } else {
    await prisma.homeTask.update({
      where: { id: task.id },
      data: {
        status: "Declined",
        confirmationSource: params.source,
      },
    })
  }

  if (companyId && task.home) {
    const contractorName = task.contractor?.companyName ?? "Contractor"
    if (params.confirmed) {
      const { notifyTaskConfirmedByContractor } = await import("@/lib/notificationRules")
      await notifyTaskConfirmedByContractor({
        companyId,
        homeId: task.homeId,
        taskId: task.id,
        taskName: task.nameSnapshot,
        homeLabel: task.home.addressOrLot ?? "Home",
        contractorName,
        confirmed: true,
      }).catch((err) => console.error("[confirmation] notifyTaskConfirmedByContractor:", err))
    } else {
      // Product: Unavailable / SMS N = contractor reschedule request
      const { notifyTaskRescheduleRequestedByContractor } = await import(
        "@/lib/notificationRules"
      )
      await notifyTaskRescheduleRequestedByContractor({
        companyId,
        homeId: task.homeId,
        taskId: task.id,
        taskName: task.nameSnapshot,
        homeLabel: task.home.addressOrLot ?? "Home",
        contractorName,
        rescheduleRequestId: task.id,
      }).catch((err) =>
        console.error("[confirmation] notifyTaskRescheduleRequestedByContractor:", err)
      )
    }

    const sourceLabel = params.source === "MagicLink" ? "magic link" : "SMS"
    const { createActivityEvent } = await import("@/lib/activity")
    await createActivityEvent({
      companyId,
      homeId: task.homeId,
      taskId: task.id,
      eventType: params.confirmed ? "sms_confirmed" : "sms_declined",
      title: params.confirmed
        ? `${task.nameSnapshot} confirmed via ${sourceLabel}`
        : `${task.nameSnapshot} marked unavailable via ${sourceLabel}`,
      recipientName: contractorName,
      metadata: { source: params.source, confirmationSource: params.source },
    }).catch(() => {})
  }

  return {
    ok: true,
    taskId: task.id,
    status: params.confirmed ? "Confirmed" : "Declined",
  }
}

export async function applyConfirmAllPending(
  prisma: PrismaClient,
  params: {
    taskIds: string[]
    source: TaskConfirmationSource
    expectedCompanyId: string
  }
): Promise<{ confirmed: number; failed: number }> {
  let confirmed = 0
  let failed = 0
  for (const taskId of params.taskIds) {
    const result = await applyTaskConfirmationResponse(prisma, {
      taskId,
      confirmed: true,
      source: params.source,
      expectedCompanyId: params.expectedCompanyId,
    })
    if (result.ok) confirmed++
    else failed++
  }
  return { confirmed, failed }
}
