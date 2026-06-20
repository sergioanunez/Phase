import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { TaskRescheduleReason, TaskStatus } from "@prisma/client"
import { z } from "zod"
import { normalizeStoredScheduledDate } from "@/lib/calendar-date"
import { sendTaskConfirmationInternal } from "@/lib/send-task-confirmation-internal"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const rescheduleSchema = z
  .object({
    scheduledDate: z.string().datetime(),
    contractorId: z.string().optional().nullable(),
    reason: z.nativeEnum(TaskRescheduleReason),
    note: z.string().optional().nullable(),
    resendSms: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.reason === "other" && !val.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add reason is required when Other is selected",
        path: ["note"],
      })
    }
  })

const taskInclude = {
  contractor: true,
  home: {
    include: {
      subdivision: true,
    },
  },
  lastRescheduledBy: { select: { id: true, name: true } },
} as const

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { hasPermission } = await import("@/lib/rbac")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantContext()
    if (!hasPermission(ctx.role, "tasks:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const data = rescheduleSchema.parse(body)

    const before = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, home: { companyId: ctx.companyId } },
        ],
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

    if (!before) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const companyId = before.home.companyId
    if (companyId) {
      const { getBillingGates, UPGRADE_TITLE, UPGRADE_BODY } = await import("@/lib/billing/entitlements")
      const gates = await getBillingGates(prisma, companyId)
      if (!gates.canScheduleTasks) {
        return NextResponse.json(
          {
            error: UPGRADE_BODY,
            code: "TRIAL_ENDED",
            upgradeHint: "/admin/billing",
            title: UPGRADE_TITLE,
          },
          { status: 403 }
        )
      }
    }

    if (before.status !== "Scheduled" && before.status !== "Confirmed") {
      return NextResponse.json(
        { error: "Task must be Scheduled or Confirmed to reschedule" },
        { status: 400 }
      )
    }

    if (!before.scheduledDate) {
      return NextResponse.json(
        { error: "Task does not have a scheduled date to reschedule" },
        { status: 400 }
      )
    }

    const newScheduledDate = normalizeStoredScheduledDate(new Date(data.scheduledDate))
    const previousScheduledDate = before.scheduledDate
    if (newScheduledDate.getTime() === previousScheduledDate.getTime()) {
      return NextResponse.json({ error: "New date must differ from the current scheduled date" }, { status: 400 })
    }

    const historyCompanyId = before.companyId ?? before.home.companyId
    if (!historyCompanyId) {
      return NextResponse.json({ error: "Task has no company context" }, { status: 400 })
    }

    const { checkGateBlocking } = await import("@/lib/gates")
    const gateCheck = await checkGateBlocking(before.homeId, params.id, before.sortOrderSnapshot)

    if (gateCheck.isBlocked) {
      return NextResponse.json(
        {
          error: `Rescheduling blocked until "${gateCheck.blockingGateName}" punchlist is cleared. ${gateCheck.openPunchCount} open punch item(s) remaining.`,
          gateBlocked: true,
          blockingGateName: gateCheck.blockingGateName,
          openPunchCount: gateCheck.openPunchCount,
        },
        { status: 409 }
      )
    }

    const note = data.reason === "other" ? data.note!.trim() : null
    const statusBefore: TaskStatus = before.status

    const updateData: {
      scheduledDate: Date
      status?: TaskStatus
      confirmedAt?: null
      confirmedByUserId?: null
      confirmationSource?: null
      contractorId?: string | null
      lastRescheduleReason: TaskRescheduleReason
      lastRescheduleNote: string | null
      lastRescheduledAt: Date
      lastRescheduledByUserId: string
      lastPreviousScheduledDate: Date
      rescheduleCount: { increment: number }
    } = {
      scheduledDate: newScheduledDate,
      lastRescheduleReason: data.reason,
      lastRescheduleNote: note,
      lastRescheduledAt: new Date(),
      lastRescheduledByUserId: ctx.userId,
      lastPreviousScheduledDate: previousScheduledDate,
      rescheduleCount: { increment: 1 },
    }

    if (before.status === "Confirmed") {
      updateData.status = "Scheduled"
      updateData.confirmedAt = null
      updateData.confirmedByUserId = null
      updateData.confirmationSource = null
    }

    if (data.contractorId !== undefined) {
      updateData.contractorId = data.contractorId
    }

    const historyRow = await prisma.$transaction(async (tx) => {
      const row = await tx.taskRescheduleHistory.create({
        data: {
          companyId: historyCompanyId,
          homeId: before.homeId,
          taskId: params.id,
          previousScheduledDate,
          newScheduledDate,
          reason: data.reason,
          note,
          rescheduledByUserId: ctx.userId,
          smsResent: false,
          statusBefore,
        },
      })
      await tx.homeTask.update({
        where: { id: params.id },
        data: updateData,
      })
      return row
    })

    const after = await prisma.homeTask.findUniqueOrThrow({
      where: { id: params.id },
      include: taskInclude,
    })

    await createAuditLog(ctx.userId, "HomeTask", params.id, "UPDATE", before, after, ctx.companyId)

    const warnings: string[] = []
    let smsResent = false

    if (companyId) {
      const { notifyTaskRescheduled } = await import("@/lib/notificationRules")
      await notifyTaskRescheduled({
        companyId,
        homeId: before.homeId,
        taskId: params.id,
        taskName: after.nameSnapshot,
        homeLabel: after.home.addressOrLot,
        isCriticalPath: before.isCriticalPath ?? false,
      }).catch((err) => console.error("notifyTaskRescheduled:", err))
    }

    const actor = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    })

    const logCompanyId = after.companyId ?? companyId

    const wantsSms = data.resendSms === true
    const canSmsSend = hasPermission(ctx.role, "sms:send")

    if (wantsSms && !canSmsSend) {
      warnings.push("SMS confirmation was not sent: your role does not include permission to send SMS.")
    } else if (wantsSms && canSmsSend) {
      const smsResult = await sendTaskConfirmationInternal(prisma, params.id, {
        id: ctx.userId,
        name: actor?.name ?? null,
      })
      if (smsResult.ok) {
        smsResent = true
        await prisma.taskRescheduleHistory
          .update({
            where: { id: historyRow.id },
            data: { smsResent: true },
          })
          .catch((err) => console.error("taskRescheduleHistory smsResent update:", err))
      } else {
        warnings.push(`SMS confirmation was not sent: ${smsResult.error}`)
      }
    }

    if (logCompanyId) {
      const { createTaskRescheduledEvent } = await import("@/lib/activity")
      await createTaskRescheduledEvent({
        companyId: logCompanyId,
        homeId: after.homeId,
        taskId: params.id,
        taskName: after.nameSnapshot,
        previousScheduledDate,
        newScheduledDate,
        reason: data.reason,
        note,
        actorName: actor?.name ?? null,
        smsResent,
      }).catch((err) => console.error("createTaskRescheduledEvent:", err))
    }

    return NextResponse.json({ task: after, smsResent, warnings })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0]?.message ?? "Invalid request"
      return NextResponse.json({ error: first, issues: error.flatten() }, { status: 400 })
    }
    const { handleApiError } = await import("@/lib/api-response")
    return handleApiError(error)
  }
}
