import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"
import { PunchCategory, PunchSeverity, PunchStatus } from "@prisma/client"
import {
  tenantScopedPunchWhere,
  tenantScopedWhere,
} from "@/lib/server-transactions/tenant-scope"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const createPunchItemSchema = z.object({
  category: z.nativeEnum(PunchCategory).optional(),
  severity: z.nativeEnum(PunchSeverity).optional(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assignedContractorId: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
})

// GET /api/tasks/[id]/punch-items - Get all punch items for a task (tenant-scoped)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { hasPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantContext()

    const task = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        AND: [tenantScopedWhere(ctx.companyId)],
      },
      include: {
        home: {
          include: {
            subdivision: true,
          },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    if (ctx.role === "Subcontractor") {
      if (!ctx.contractorId || task.contractorId !== ctx.contractorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else if (!hasPermission(ctx.role, "homes:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const whereClause: Record<string, unknown> = {
      relatedHomeTaskId: params.id,
      AND: [tenantScopedPunchWhere(ctx.companyId)],
    }
    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      whereClause.OR = [
        { assignedContractorId: null },
        { assignedContractorId: ctx.contractorId },
      ]
    }

    const punchItems = await prisma.punchItem.findMany({
      where: whereClause,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignedContractor: {
          select: {
            id: true,
            companyName: true,
          },
        },
        closedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        reportedCompleteBy: {
          select: {
            id: true,
            name: true,
          },
        },
        photos: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(punchItems)
  } catch (error: any) {
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500
    if (status !== 500) {
      return NextResponse.json({ error: error.message || "Forbidden" }, { status })
    }
    console.error("Error fetching punch items:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch punch items" },
      { status: 500 }
    )
  }
}

// POST /api/tasks/[id]/punch-items - Legacy create path (assistant + flag-off UI).
// Prefer POST /api/transactions/punch-item-create when TRANSACTION_ENGINE_PUNCH_CREATE is enabled.
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
    const body = await request.json()
    const data = createPunchItemSchema.parse(body)

    const task = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        AND: [tenantScopedWhere(ctx.companyId)],
      },
      include: {
        home: true,
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const companyId = task.companyId ?? task.home.companyId ?? ctx.companyId
    if (companyId) {
      const { getBillingGates, UPGRADE_TITLE, UPGRADE_BODY } = await import("@/lib/billing/entitlements")
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

    const result = await prisma.$transaction(async (tx) => {
      const punchItem = await tx.punchItem.create({
        data: {
          companyId: ctx.companyId,
          homeId: task.homeId,
          relatedHomeTaskId: params.id,
          createdByUserId: ctx.userId,
          assignedContractorId: data.assignedContractorId || null,
          category: data.category || "Other",
          severity: data.severity || "Minor",
          title: data.title,
          description: data.description || null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          status: "Open",
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          assignedContractor: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      })

      const openPunchCount = await tx.punchItem.count({
        where: {
          relatedHomeTaskId: params.id,
          status: {
            in: ["Open", "ReadyForReview"],
          },
        },
      })

      await tx.homeTask.update({
        where: { id: params.id },
        data: {
          hasOpenPunch: openPunchCount > 0,
          punchOpenCount: openPunchCount,
        },
      })

      return punchItem
    })

    await createAuditLog(
      ctx.userId,
      "PunchItem",
      result.id,
      "CREATE",
      null,
      result,
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
        homeId: result.homeId,
        taskId: params.id,
        taskName: task.nameSnapshot,
        homeLabel: (task.home as { addressOrLot?: string }).addressOrLot ?? "Home",
        punchCount: openPunchCount,
        createdByUserId: ctx.userId,
      }).catch((err) => console.error("notifyPunchItemsAddedToTask:", err))
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500
    if (status !== 500) {
      return NextResponse.json({ error: error.message || "Forbidden" }, { status })
    }
    console.error("Error creating punch item:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create punch item" },
      { status: 500 }
    )
  }
}
