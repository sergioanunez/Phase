import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { PunchCategory, PunchSeverity, PunchStatus } from "@prisma/client"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { tenantScopedPunchWhere } from "@/lib/server-transactions/tenant-scope"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const updatePunchItemSchema = z.object({
  category: z.nativeEnum(PunchCategory).optional(),
  severity: z.nativeEnum(PunchSeverity).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  assignedContractorId: z.string().optional().nullable(),
  status: z.nativeEnum(PunchStatus).optional(),
  dueDate: z.string().datetime().optional().nullable(),
})

const punchInclude = {
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
  relatedHomeTask: {
    include: {
      home: {
        include: {
          subdivision: true,
        },
      },
    },
  },
  photos: {
    orderBy: {
      createdAt: "asc" as const,
    },
  },
}

// GET /api/punch-items/[id] - Get a single punch item (tenant-scoped)
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

    if (ctx.role !== "Subcontractor" && !hasPermission(ctx.role, "homes:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const punchItem = await prisma.punchItem.findFirst({
      where: {
        id: params.id,
        AND: [tenantScopedPunchWhere(ctx.companyId)],
      },
      include: punchInclude,
    })

    if (!punchItem) {
      return NextResponse.json({ error: "Punch item not found" }, { status: 404 })
    }

    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      if (punchItem.assignedContractorId !== ctx.contractorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    return NextResponse.json(punchItem)
  } catch (error: any) {
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500
    if (status !== 500) {
      return NextResponse.json({ error: error.message || "Forbidden" }, { status })
    }
    console.error("Error fetching punch item:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch punch item" },
      { status: 500 }
    )
  }
}

// PATCH /api/punch-items/[id] - Update a punch item (tenant-scoped)
export async function PATCH(
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
    const data = updatePunchItemSchema.parse(body)

    const before = await prisma.punchItem.findFirst({
      where: {
        id: params.id,
        AND: [tenantScopedPunchWhere(ctx.companyId)],
      },
      include: {
        relatedHomeTask: {
          include: {
            home: { select: { id: true, addressOrLot: true, companyId: true } },
          },
        },
      },
    })

    if (!before) {
      return NextResponse.json({ error: "Punch item not found" }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (data.category !== undefined) updateData.category = data.category
    if (data.severity !== undefined) updateData.severity = data.severity
    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description
    if (data.assignedContractorId !== undefined) updateData.assignedContractorId = data.assignedContractorId
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null

    if (data.status !== undefined) {
      updateData.status = data.status
      if (data.status === "Closed" && !before.closedAt) {
        updateData.closedAt = new Date()
        updateData.closedByUserId = ctx.userId
      } else if (data.status !== "Closed" && before.closedAt) {
        updateData.closedAt = null
        updateData.closedByUserId = null
      }
    }

    // Backfill companyId when missing so future lookups stay tenant-direct.
    if (!before.companyId) {
      updateData.companyId = ctx.companyId
    }

    const result = await prisma.$transaction(async (tx) => {
      const after = await tx.punchItem.update({
        where: { id: before.id },
        data: updateData,
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
        },
      })

      const openPunchCount = await tx.punchItem.count({
        where: {
          relatedHomeTaskId: before.relatedHomeTaskId,
          status: {
            in: ["Open", "ReadyForReview"],
          },
        },
      })

      await tx.homeTask.update({
        where: { id: before.relatedHomeTaskId },
        data: {
          hasOpenPunch: openPunchCount > 0,
          punchOpenCount: openPunchCount,
        },
      })

      return after
    })

    await createAuditLog(
      ctx.userId,
      "PunchItem",
      params.id,
      "UPDATE",
      before,
      result,
      ctx.companyId
    )

    const home = before.relatedHomeTask?.home
    if (
      data.status === "Closed" &&
      before.status !== "Closed" &&
      home?.companyId &&
      before.relatedHomeTask
    ) {
      const { notifyPunchItemCompleted } = await import("@/lib/notificationRules")
      await notifyPunchItemCompleted({
        companyId: home.companyId,
        homeId: home.id,
        taskId: before.relatedHomeTask.id,
        taskName: before.relatedHomeTask.nameSnapshot,
        homeLabel: home.addressOrLot ?? "Home",
        punchItemId: params.id,
        punchTitle: result.title,
      }).catch((err) => console.error("notifyPunchItemCompleted:", err))
    }

    return NextResponse.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500
    if (status !== 500) {
      return NextResponse.json({ error: error.message || "Forbidden" }, { status })
    }
    console.error("Error updating punch item:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update punch item" },
      { status: 500 }
    )
  }
}

// DELETE /api/punch-items/[id] - Delete a punch item (tenant-scoped)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("tasks:write")

    const before = await prisma.punchItem.findFirst({
      where: {
        id: params.id,
        AND: [tenantScopedPunchWhere(ctx.companyId)],
      },
      include: {
        relatedHomeTask: true,
      },
    })

    if (!before) {
      return NextResponse.json({ error: "Punch item not found" }, { status: 404 })
    }

    const taskId = before.relatedHomeTaskId

    await prisma.$transaction(async (tx) => {
      await tx.punchItem.delete({
        where: { id: before.id },
      })

      const openPunchCount = await tx.punchItem.count({
        where: {
          relatedHomeTaskId: taskId,
          status: {
            in: ["Open", "ReadyForReview"],
          },
        },
      })

      await tx.homeTask.update({
        where: { id: taskId },
        data: {
          hasOpenPunch: openPunchCount > 0,
          punchOpenCount: openPunchCount,
        },
      })
    })

    await createAuditLog(
      ctx.userId,
      "PunchItem",
      params.id,
      "DELETE",
      before,
      null,
      ctx.companyId
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500
    if (status !== 500) {
      return NextResponse.json({ error: error.message || "Forbidden" }, { status })
    }
    console.error("Error deleting punch item:", error)
    return NextResponse.json(
      { error: error.message || "Failed to delete punch item" },
      { status: 500 }
    )
  }
}
