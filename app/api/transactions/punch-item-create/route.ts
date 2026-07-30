import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { handleApiError } from "@/lib/api-response"
import {
  envelopeHttpStatus,
  executeIdempotentMutation,
  PermanentRejectionError,
} from "@/lib/server-transactions"
import {
  createPunchItemInTransaction,
  punchItemCreateBodySchema,
  type PunchItemCreateEntity,
} from "@/lib/punch/create-punch-item"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * Transaction Engine PunchItem create.
 * Prefer this over legacy POST /api/tasks/[id]/punch-items when
 * TRANSACTION_ENGINE_PUNCH_CREATE / NEXT_PUBLIC_TRANSACTION_ENGINE_PUNCH_CREATE is enabled.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { prisma } = await import("@/lib/prisma")
    const ctx = await requireTenantPermission("tasks:write")

    const json = await request.json()
    const headerKey = request.headers.get("idempotency-key")?.trim()
    const body = punchItemCreateBodySchema.parse({
      ...json,
      idempotencyKey: json.idempotencyKey ?? headerKey,
    })

    // Billing gate (read-only; outside mutation TX)
    const { getBillingGates, UPGRADE_TITLE, UPGRADE_BODY } = await import(
      "@/lib/billing/entitlements"
    )
    const gates = await getBillingGates(prisma, ctx.companyId)
    if (!gates.canCreatePunchlists) {
      return NextResponse.json(
        {
          status: "rejected",
          idempotencyKey: body.idempotencyKey,
          error: {
            code: "TRIAL_ENDED",
            message: UPGRADE_BODY,
            retryable: false,
          },
          title: UPGRADE_TITLE,
          upgradeHint: "/admin/billing",
        },
        { status: 403 }
      )
    }

    const notifyBox: {
      current: {
        companyId: string
        homeId: string
        taskId: string
        taskName: string
        homeLabel: string
        createdByUserId: string
      } | null
    } = { current: null }

    const envelope = await executeIdempotentMutation<PunchItemCreateEntity>({
      prisma,
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      idempotencyKey: body.idempotencyKey,
      mutationType: "PUNCH_ITEM_CREATE",
      entityType: "PunchItem",
      entityId: body.clientPunchItemId,
      execute: async ({ tx }) => {
        const result = await createPunchItemInTransaction({
          tx,
          companyId: ctx.companyId,
          actorUserId: ctx.userId,
          idempotencyKey: body.idempotencyKey,
          input: body,
        })

        if (result.status === "applied" && result.entity) {
          const task = await tx.homeTask.findFirst({
            where: { id: body.homeTaskId },
            select: {
              nameSnapshot: true,
              home: { select: { addressOrLot: true } },
            },
          })
          notifyBox.current = {
            companyId: ctx.companyId,
            homeId: result.entity.homeId,
            taskId: body.homeTaskId,
            taskName: task?.nameSnapshot ?? "Task",
            homeLabel: task?.home?.addressOrLot ?? "Home",
            createdByUserId: ctx.userId,
          }
        }

        return result
      },
    })

    // Side effects after commit — only on first apply (not noop/replay)
    if (envelope.status === "applied" && notifyBox.current) {
      const notify = notifyBox.current
      const openPunchCount = await prisma.punchItem.count({
        where: {
          relatedHomeTaskId: notify.taskId,
          status: { in: ["Open", "ReadyForReview"] },
        },
      })
      const { notifyPunchItemsAddedToTask } = await import("@/lib/notificationRules")
      await notifyPunchItemsAddedToTask({
        companyId: notify.companyId,
        homeId: notify.homeId,
        taskId: notify.taskId,
        taskName: notify.taskName,
        homeLabel: notify.homeLabel,
        createdByUserId: notify.createdByUserId,
        punchCount: openPunchCount,
      }).catch((err) => console.error("[PUNCH_ITEM_CREATE] notify:", err))
    }

    if (envelope.status === "applied") {
      console.info("[PUNCH_ITEM_CREATE] applied", {
        companyId: ctx.companyId,
        mutationId: envelope.mutationId,
        entityId: envelope.entityId,
      })
    } else if (envelope.status === "noop") {
      console.info("[PUNCH_ITEM_CREATE] noop", {
        companyId: ctx.companyId,
        mutationId: envelope.mutationId,
        entityId: envelope.entityId,
      })
    } else if (envelope.status === "rejected") {
      console.info("[PUNCH_ITEM_CREATE] rejected", {
        companyId: ctx.companyId,
        code: envelope.error.code,
        retryable: envelope.error.retryable,
      })
    }

    return NextResponse.json(envelope, { status: envelopeHttpStatus(envelope) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: "rejected",
          idempotencyKey: "",
          error: {
            code: "VALIDATION",
            message: "Invalid punch item request",
            retryable: false,
          },
        },
        { status: 400 }
      )
    }
    if (error instanceof PermanentRejectionError) {
      return NextResponse.json(
        {
          status: "rejected",
          idempotencyKey: "",
          error: {
            code: error.code,
            message: error.userMessage,
            retryable: false,
          },
        },
        { status: error.httpHint === "NOT_FOUND" ? 404 : 400 }
      )
    }
    return handleApiError(error)
  }
}
