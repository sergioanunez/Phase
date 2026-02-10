import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission } from "@/lib/rbac"
import { getAssignedHomeIdsForContractor } from "@/lib/tenant"
import { handleApiError } from "@/lib/api-response"
import { parseISO, format } from "date-fns"
import { TaskStatus } from "@prisma/client"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

/** Monday 00:00:00 UTC for the week containing the given date. */
function startOfWeekUTC(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + mondayOffset
    )
  )
}

/** Sunday 23:59:59.999 UTC for the week that starts on the given Monday. */
function endOfWeekUTC(mondayUTC: Date): Date {
  return new Date(
    Date.UTC(
      mondayUTC.getUTCFullYear(),
      mondayUTC.getUTCMonth(),
      mondayUTC.getUTCDate() + 6,
      23,
      59,
      59,
      999
    )
  )
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("my-week:view")

    if (!ctx.contractorId) {
      return NextResponse.json(
        { error: "User must be linked to a contractor" },
        { status: 400 }
      )
    }

    const assignedHomeIds = await getAssignedHomeIdsForContractor(ctx.companyId, ctx.contractorId)
    if (assignedHomeIds.length === 0) {
      const mon = startOfWeekUTC(new Date())
      return NextResponse.json({
        weekStart: format(mon, "yyyy-MM-dd"),
        weekEnd: format(endOfWeekUTC(mon), "yyyy-MM-dd"),
        tasks: [],
        tasksByDay: {},
      })
    }

    const { searchParams } = new URL(request.url)
    const weekStartParam = searchParams.get("weekStart")
    const mode = searchParams.get("mode") || "all"

    let weekStart: Date
    if (weekStartParam) {
      weekStart = parseISO(weekStartParam)
    } else {
      weekStart = startOfWeekUTC(new Date())
    }

    const weekEnd = endOfWeekUTC(weekStart)

    const statusFilter: TaskStatus[] =
      mode === "confirmed"
        ? ["Confirmed"]
        : mode === "pending"
        ? ["PendingConfirm"]
        : ["Scheduled", "PendingConfirm", "Confirmed"]

    const tasks = await prisma.homeTask.findMany({
      where: {
        companyId: ctx.companyId,
        homeId: { in: assignedHomeIds },
        contractorId: ctx.contractorId,
        scheduledDate: { gte: weekStart, lte: weekEnd },
        status: { in: statusFilter },
      },
      include: {
        home: {
          include: {
            subdivision: true,
          },
        },
        punchItems: {
          where: { status: { in: ["Open", "ReadyForReview"] } },
          select: { id: true, title: true, status: true, severity: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [
        { scheduledDate: "asc" },
        { nameSnapshot: "asc" },
      ],
    })

    // Group by day
    const tasksByDay: Record<string, typeof tasks> = {}
    tasks.forEach((task) => {
      if (task.scheduledDate) {
        const dayKey = format(new Date(task.scheduledDate), "yyyy-MM-dd")
        if (!tasksByDay[dayKey]) {
          tasksByDay[dayKey] = []
        }
        tasksByDay[dayKey].push(task)
      }
    })

    return NextResponse.json({
      weekStart: format(weekStart, "yyyy-MM-dd"),
      weekEnd: format(weekEnd, "yyyy-MM-dd"),
      tasks,
      tasksByDay,
    })
  } catch (error: any) {
    return handleApiError(error)
  }
}
