import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { handleApiError } from "@/lib/api-response"
import { tenantScopedWhere } from "@/lib/server-transactions/tenant-scope"
import {
  createPunchListBodySchema,
  createPunchListWithItems,
} from "@/lib/punch/punch-list"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * POST /api/tasks/[id]/punch-lists
 * Create one PunchList + one or more PunchItems (atomic, online).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("tasks:write")

    const body = createPunchListBodySchema.parse(await request.json())

    const task = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        AND: [tenantScopedWhere(ctx.companyId)],
      },
      include: { home: true },
    })
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const companyId = task.companyId ?? task.home.companyId ?? ctx.companyId
    if (companyId) {
      const { getBillingGates, UPGRADE_TITLE, UPGRADE_BODY } = await import(
        "@/lib/billing/entitlements"
      )
      const gates = await getBillingGates(prisma, companyId)
      if (!gates.canCreatePunchlists) {
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

    const result = await prisma.$transaction(async (tx) =>
      createPunchListWithItems({
        tx,
        companyId: ctx.companyId,
        actorUserId: ctx.userId,
        homeTaskId: params.id,
        input: body,
      })
    )

    if (result.created) {
      await createAuditLog(
        ctx.userId,
        "PunchList",
        result.list.id,
        "CREATE",
        null,
        {
          id: result.list.id,
          assignedContractorId: result.list.assignedContractorId,
          itemCount: result.list.items.length,
        },
        ctx.companyId
      )

      const { notifyPunchItemsAddedToTask } = await import("@/lib/notificationRules")
      if (task.home && ctx.companyId) {
        const openPunchCount = await prisma.punchItem.count({
          where: {
            relatedHomeTaskId: params.id,
            status: { in: ["Open", "ReadyForReview"] },
          },
        })
        await notifyPunchItemsAddedToTask({
          companyId: ctx.companyId,
          homeId: result.list.homeId,
          taskId: params.id,
          taskName: task.nameSnapshot,
          homeLabel: (task.home as { addressOrLot?: string }).addressOrLot ?? "Home",
          punchCount: openPunchCount,
          createdByUserId: ctx.userId,
        }).catch((err) => console.error("notifyPunchItemsAddedToTask:", err))
      }
    }

    return NextResponse.json(result.list, { status: result.created ? 201 : 200 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return handleApiError(error)
  }
}
