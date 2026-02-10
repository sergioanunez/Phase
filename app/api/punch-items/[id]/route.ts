import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { PunchCategory, PunchSeverity, PunchStatus } from "@prisma/client"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const updatePunchItemSchema = z.object({
  category: z.nativeEnum(PunchCategory).optional(),
  severity: z.nativeEnum(PunchSeverity).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  assignedContractorId: z.string().optional().nullable(),
  status: z.nativeEnum(PunchStatus).optional(),
  dueDate: z.string().datetime().optional().nullable(),
})

// GET /api/punch-items/[id] - Get a single punch item
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await requirePermission("homes:read")

    const punchItem = await prisma.punchItem.findUnique({
      where: { id: params.id },
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
            createdAt: "asc",
          },
        },
      },
    })

    if (!punchItem) {
      return NextResponse.json({ error: "Punch item not found" }, { status: 404 })
    }

    // For Subcontractor, only allow viewing if assigned to their contractor
    if (session.user.role === "Subcontractor" && session.user.contractorId) {
      if (punchItem.assignedContractorId !== session.user.contractorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    return NextResponse.json(punchItem)
  } catch (error: any) {
    console.error("Error fetching punch item:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch punch item" },
      { status: 500 }
    )
  }
}

// PATCH /api/punch-items/[id] - Update a punch item
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const user = await requirePermission("homes:write")
    const body = await request.json()
    const data = updatePunchItemSchema.parse(body)

    const before = await prisma.punchItem.findUnique({
      where: { id: params.id },
      include: {
        relatedHomeTask: true,
      },
    })

    if (!before) {
      return NextResponse.json({ error: "Punch item not found" }, { status: 404 })
    }

    const updateData: any = {}
    if (data.category !== undefined) updateData.category = data.category
    if (data.severity !== undefined) updateData.severity = data.severity
    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description
    if (data.assignedContractorId !== undefined) updateData.assignedContractorId = data.assignedContractorId
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null

    // Handle status change
    if (data.status !== undefined) {
      updateData.status = data.status
      if (data.status === "Closed" && !before.closedAt) {
        updateData.closedAt = new Date()
        updateData.closedByUserId = user.id
      } else if (data.status !== "Closed" && before.closedAt) {
        updateData.closedAt = null
        updateData.closedByUserId = null
      }
    }

    // Update punch item and task counts in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const after = await tx.punchItem.update({
        where: { id: params.id },
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
        },
      })

      // Update task punch counts
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
      user.id,
      "PunchItem",
      params.id,
      "UPDATE",
      before,
      result
    )

    return NextResponse.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error("Error updating punch item:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update punch item" },
      { status: 500 }
    )
  }
}

// DELETE /api/punch-items/[id] - Delete a punch item
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const user = await requirePermission("homes:write")

    const before = await prisma.punchItem.findUnique({
      where: { id: params.id },
      include: {
        relatedHomeTask: true,
      },
    })

    if (!before) {
      return NextResponse.json({ error: "Punch item not found" }, { status: 404 })
    }

    const taskId = before.relatedHomeTaskId

    // Delete punch item and update task counts in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.punchItem.delete({
        where: { id: params.id },
      })

      // Update task punch counts
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
      user.id,
      "PunchItem",
      params.id,
      "DELETE",
      before,
      null
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting punch item:", error)
    return NextResponse.json(
      { error: error.message || "Failed to delete punch item" },
      { status: 500 }
    )
  }
}
