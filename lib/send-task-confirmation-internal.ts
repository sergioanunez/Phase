import type { PrismaClient } from "@prisma/client"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"

export type SendTaskConfirmationResult =
  | { ok: true }
  | {
      ok: false
      status: number
      error: string
      categoryBlocked?: boolean
      gateBlocked?: boolean
      blockingGateName?: string
      openPunchCount?: number
    }

type Actor = { id: string; name: string | null }

/**
 * Shared implementation for POST /api/tasks/[id]/send-confirmation and post-reschedule SMS resend.
 * Caller must enforce permission (e.g. sms:send) before calling.
 */
export async function sendTaskConfirmationInternal(
  prisma: PrismaClient,
  taskId: string,
  actor: Actor
): Promise<SendTaskConfirmationResult> {
  const task = await prisma.homeTask.findUnique({
    where: { id: taskId },
    include: {
      contractor: true,
      home: {
        include: {
          subdivision: true,
        },
      },
    },
  })

  if (!task) {
    return { ok: false, status: 404, error: "Task not found" }
  }

  if (!task.contractorId || !task.contractor) {
    return { ok: false, status: 400, error: "Task must have a contractor assigned" }
  }

  if (!task.scheduledDate) {
    return { ok: false, status: 400, error: "Task must have a scheduled date" }
  }

  if (task.status !== "Scheduled" && task.status !== "PendingConfirm") {
    return {
      ok: false,
      status: 400,
      error: "Task must be Scheduled or PendingConfirm to send confirmation",
    }
  }

  const taskWithTemplate = await prisma.homeTask.findUnique({
    where: { id: taskId },
    include: {
      templateItem: {
        select: {
          isCriticalGate: true,
          gateBlockMode: true,
          optionalCategory: true,
        },
      },
    },
  })

  const allTasks = await prisma.homeTask.findMany({
    where: { homeId: task.homeId },
    include: {
      templateItem: {
        select: {
          isCriticalGate: true,
          gateScope: true,
          gateBlockMode: true,
          gateName: true,
          optionalCategory: true,
        },
      },
    },
    orderBy: [...homeTaskOrderByTemplateSequence()],
  })

  const currentTaskCategory = taskWithTemplate?.templateItem?.optionalCategory || "Uncategorized"

  const categoryOrder = [
    "Preliminary work",
    "Foundation",
    "Structural",
    "Interior finishes / exterior rough work",
    "Finals punches and inspections.",
    "Pre-sale completion package",
  ]

  const getCategoryIndex = (category: string | null): number => {
    const normalized = (category || "Uncategorized").toLowerCase().trim().replace("prelliminary", "preliminary")
    const index = categoryOrder.findIndex((orderCat) => orderCat.toLowerCase().trim() === normalized)
    return index !== -1 ? index : 999
  }

  const currentCategoryIndex = getCategoryIndex(currentTaskCategory)

  const companyId = task.home?.companyId ?? null
  const categoryGates = await prisma.categoryGate.findMany({
    where: companyId != null ? { companyId } : { companyId: null },
  })
  const normalizeCategory = (c: string | null) =>
    (c || "Uncategorized").toLowerCase().trim().replace(/prelliminary/gi, "preliminary")

  for (const categoryGate of categoryGates) {
    const gateCategoryIndex = getCategoryIndex(categoryGate.categoryName)

    if (gateCategoryIndex >= currentCategoryIndex) {
      continue
    }

    let gateApplies = false

    if (categoryGate.gateScope === "AllScheduling") {
      gateApplies = true
    } else if (categoryGate.gateScope === "DownstreamOnly") {
      gateApplies = currentCategoryIndex > gateCategoryIndex
    }

    if (gateApplies) {
      const gateCategoryNorm = normalizeCategory(categoryGate.categoryName)
      const gatedCategoryTasks = allTasks.filter(
        (t) => normalizeCategory(t.templateItem?.optionalCategory ?? null) === gateCategoryNorm
      )

      const incompleteGatedTasks = gatedCategoryTasks.filter(
        (t) => t.status !== "Completed" && t.status !== "Canceled"
      )

      if (incompleteGatedTasks.length > 0) {
        const gateName =
          categoryGate.gateName || `${categoryGate.categoryName.replace(/Prelliminary/gi, "Preliminary")} Gate`
        const taskNames = incompleteGatedTasks.map((t) => t.nameSnapshot).join(", ")
        return {
          ok: false,
          status: 400,
          error: `Cannot send confirmation. All tasks in "${gateName}" must be completed first: ${taskNames}`,
          categoryBlocked: true,
        }
      }
    }
  }

  const gateTasks = allTasks.filter(
    (t) => t.templateItem?.isCriticalGate && t.templateItem?.gateBlockMode === "ScheduleAndConfirm"
  )

  for (const gateTask of gateTasks) {
    const gateScope = gateTask.templateItem?.gateScope || "DownstreamOnly"
    let gateApplies = false

    if (gateScope === "AllScheduling") {
      gateApplies = true
    } else if (gateScope === "DownstreamOnly") {
      gateApplies = task.sortOrderSnapshot > gateTask.sortOrderSnapshot
    }

    if (gateApplies) {
      const openPunchCount = await prisma.punchItem.count({
        where: {
          relatedHomeTaskId: gateTask.id,
          status: {
            in: ["Open", "ReadyForReview"],
          },
        },
      })

      if (openPunchCount > 0) {
        const gateName = gateTask.templateItem?.gateName || "Critical Gate"
        return {
          ok: false,
          status: 409,
          error: `Cannot send confirmation. Scheduling blocked until "${gateName}" punchlist is cleared. ${openPunchCount} open punch item(s) remaining.`,
          gateBlocked: true,
          blockingGateName: gateName,
          openPunchCount,
        }
      }
    }
  }

  const accountSid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim()
  if (!accountSid || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    return {
      ok: false,
      status: 500,
      error:
        "Twilio is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables.",
    }
  }
  if (!accountSid.startsWith("AC")) {
    return {
      ok: false,
      status: 500,
      error:
        "Invalid TWILIO_ACCOUNT_SID: it must start with AC (from your Twilio console). Check your environment variables.",
    }
  }

  const { getSmsRecipientForContractor, logSmsBlocked } = await import("@/lib/sms-guard")
  const recipient = await getSmsRecipientForContractor(task.contractor.id)
  if (!recipient.allowed) {
    logSmsBlocked(task.contractor.id, recipient.reason, { taskId: task.id, action: "send_confirmation" })
    const message =
      recipient.reason === "no_contact"
        ? "No contact has opted in to SMS for this vendor. Invite a contact from the Vendors tab and have them accept the invite with SMS consent."
        : recipient.reason === "no_phone"
          ? "This contact has not added a phone number yet."
          : recipient.reason === "no_consent"
            ? "This contact has not opted in to SMS yet."
            : "This contact has unsubscribed from SMS."
    return { ok: false, status: 400, error: message }
  }

  const { sendConfirmationSMS } = await import("@/lib/twilio")
  try {
    await sendConfirmationSMS(
      task.id,
      recipient.phoneE164,
      task.home.addressOrLot,
      task.nameSnapshot,
      new Date(task.scheduledDate)
    )
  } catch (error: unknown) {
    const { message, status } = formatSendConfirmationError(error)
    return { ok: false, status, error: message }
  }

  const activityCompanyId = task.companyId ?? task.home.companyId
  if (activityCompanyId) {
    const { createTaskScheduledEvent, createSmsSentEvent } = await import("@/lib/activity")
    createTaskScheduledEvent({
      companyId: activityCompanyId,
      homeId: task.homeId,
      taskId: task.id,
      taskName: task.nameSnapshot,
      scheduledDate: new Date(task.scheduledDate!),
      recipientName: task.contractor?.companyName ?? undefined,
      actorName: actor.name,
    }).catch(() => {})
    createSmsSentEvent({
      companyId: activityCompanyId,
      homeId: task.homeId,
      taskId: task.id,
      messageType: "scheduled",
      taskName: task.nameSnapshot,
      recipientName: task.contractor?.companyName ?? undefined,
    }).catch(() => {})
  }

  return { ok: true }
}

export function formatSendConfirmationError(error: unknown): { message: string; status: number } {
  let errorMessage = "Failed to send confirmation SMS"
  let status = 500
  const err = error as { message?: string; code?: number }
  if (err?.message?.includes("accountSid must start with AC")) {
    errorMessage =
      "Invalid TWILIO_ACCOUNT_SID: it must start with AC (from your Twilio console). Check your environment variables."
  } else if (err?.message) {
    errorMessage = err.message
  }
  if (err?.code) {
    switch (err.code) {
      case 21211:
        errorMessage = "Invalid phone number format. Please use E.164 format (e.g., +1234567890)"
        break
      case 21212:
        errorMessage = "Invalid 'to' phone number"
        break
      case 21214:
        errorMessage = "Invalid 'from' phone number"
        break
      case 21608:
        errorMessage = "Unverified phone number. Please verify the number in Twilio console"
        break
      case 21614:
        errorMessage = "Unsubscribed recipient. The phone number has opted out"
        break
      case 30007:
        errorMessage = "Invalid destination phone number"
        break
      default:
        errorMessage = `Twilio error (${err.code}): ${err.message || "Unknown error"}`
    }
  }
  return { message: errorMessage, status }
}
