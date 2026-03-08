import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { format } from "date-fns"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

function jsonResponse(body: unknown, status: number) {
  try {
    const text = JSON.stringify(body)
    return new NextResponse(text, {
      status,
      headers: { "Content-Type": "application/json" },
    })
  } catch {
    return new NextResponse(
      JSON.stringify({ error: "Failed to cancel schedule" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params?: Promise<{ id: string }> | { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    let taskId: string
    try {
      const params = context?.params
      if (params == null) {
        return jsonResponse({ error: "Missing route params" }, 400)
      }
      const resolved = await Promise.resolve(params)
      taskId = resolved?.id
      if (typeof taskId !== "string" || !taskId) {
        return jsonResponse({ error: "Invalid task id" }, 400)
      }
    } catch (e) {
      console.error("Cancel schedule params error:", e)
      return jsonResponse({ error: "Invalid request" }, 400)
    }

    try {
      await requirePermission("tasks:write")
    } catch (authError: unknown) {
      const msg =
        authError instanceof Error ? authError.message : "Unauthorized"
      const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500
      console.error("Cancel schedule auth error:", authError)
      return jsonResponse({ error: msg }, status)
    }

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
      return jsonResponse({ error: "Task not found" }, 404)
    }

    if (!task.scheduledDate) {
      return jsonResponse(
        { error: "Task does not have a scheduled date" },
        400
      )
    }

    // Send cancellation SMS when task has a contractor we may have texted (Confirmed, PendingConfirm, or Scheduled) — to default contact only
    const contractor = task.contractor
    const shouldSendCancelSms =
      contractor &&
      (task.status === "Confirmed" || task.status === "PendingConfirm" || task.status === "Scheduled")
    if (shouldSendCancelSms && contractor) {
      const { getSmsRecipientForContractor, logSmsBlocked } = await import("@/lib/sms-guard")
      const recipient = await getSmsRecipientForContractor(contractor.id)
      if (recipient.allowed) {
        try {
          const { sendCancellationSMS } = await import("@/lib/twilio")
          await sendCancellationSMS(
            task.id,
            recipient.phoneE164,
            task.home.addressOrLot,
            task.nameSnapshot,
            new Date(task.scheduledDate)
          )
          const companyId = task.companyId ?? task.home.companyId
          if (companyId) {
            const { createSmsSentEvent } = await import("@/lib/activity")
            createSmsSentEvent({
              companyId,
              homeId: task.homeId,
              taskId: task.id,
              messageType: "cancelled",
              taskName: task.nameSnapshot,
              recipientName: contractor.companyName,
            }).catch(() => {})
          }
        } catch (smsError: unknown) {
          console.error("Failed to send cancellation SMS:", smsError)
          // Continue with cancellation even if SMS fails
        }
      } else {
        logSmsBlocked(contractor.id, recipient.reason, { taskId: task.id, action: "cancel_schedule" })
      }
    }

    // Update task to cancel schedule
    const updatedTask = await prisma.homeTask.update({
      where: { id: taskId },
      data: {
        scheduledDate: null,
        contractorId: null,
        status: "Unscheduled",
      },
      include: {
        contractor: true,
        home: {
          include: {
            subdivision: true,
          },
        },
      },
    })

    return jsonResponse(updatedTask, 200)
  } catch (error: unknown) {
    console.error("Cancel schedule error (full):", error)
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to cancel schedule"
    return jsonResponse({ error: message }, 500)
  }
}
