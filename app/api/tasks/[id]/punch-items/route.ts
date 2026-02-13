import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"
import { PunchCategory, PunchSeverity, PunchStatus } from "@prisma/client"

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

// GET /api/tasks/[id]/punch-items - Get all punch items for a task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const task = await prisma.homeTask.findUnique({
      where: { id: params.id },
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

    // Subcontractor: only allow if task is assigned to their contractor
    if (session.user.role === "Subcontractor") {
      if (!session.user.contractorId || task.contractorId !== session.user.contractorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else {
      await requirePermission("homes:read")
    }

    // For Subcontractor, only show punch items assigned to them or unassigned
    const whereClause: any = {
      relatedHomeTaskId: params.id,
    }
    if (session.user.role === "Subcontractor" && session.user.contractorId) {
      whereClause.OR = [
        { assignedContractorId: null },
        { assignedContractorId: session.user.contractorId },
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
    console.error("Error fetching punch items:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch punch items" },
      { status: 500 }
    )
  }
}

// POST /api/tasks/[id]/punch-items - Create a new punch item
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const user = await requirePermission("homes:write")
    const body = await request.json()
    const data = createPunchItemSchema.parse(body)

    const task = await prisma.homeTask.findUnique({
      where: { id: params.id },
      include: {
        home: true,
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Create punch item in a transaction to update task counts
    const result = await prisma.$transaction(async (tx) => {
      const punchItem = await tx.punchItem.create({
        data: {
          homeId: task.homeId,
          relatedHomeTaskId: params.id,
          createdByUserId: user.id,
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

      // Update task punch counts
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
      user.id,
      "PunchItem",
      result.id,
      "CREATE",
      null,
      result
    )

    const { notifyPunchAdded } = await import("@/lib/notificationRules")
    const task = await prisma.homeTask.findUnique({
      where: { id: params.id },
      include: { home: { select: { addressOrLot: true } } },
    })
    if (task?.home && task.companyId) {
      await notifyPunchAdded({
        companyId: task.companyId,
        homeId: result.homeId,
        punchId: result.id,
        taskId: params.id,
        punchTitle: result.title,
        homeLabel: task.home.addressOrLot,
        createdByUserId: user.id,
      }).catch((err) => console.error("notifyPunchAdded:", err))
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error("Error creating punch item:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create punch item" },
      { status: 500 }
    )
  }
}
