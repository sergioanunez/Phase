import { NextRequest, NextResponse } from "next/server"
import { format, parseISO, startOfDay } from "date-fns"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { handleApiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/** Calendar event shape expected by the calendar page */
export interface CalendarEventPayload {
  id: string
  date: string
  type: "inspection" | "delivery" | "trade" | "milestone" | "punchlist"
  title: string
  communityName?: string
  homeCount?: number
  homeId?: string
  homeLabel?: string
  status?: "on_track" | "at_risk" | "behind" | "completed" | "overdue"
}

export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get("start")
    const endParam = searchParams.get("end")
    const subdivisionIdParam = searchParams.get("subdivisionId")

    if (!startParam || !endParam) {
      return NextResponse.json(
        { error: "Query params start and end (ISO date) are required" },
        { status: 400 }
      )
    }

    const start = parseISO(startParam)
    const end = parseISO(endParam)
    const today = startOfDay(new Date())

    let allowedHomeIds: string[] | null = null
    if (ctx.role === "Superintendent" && ctx.companyId && ctx.userId) {
      const assignments = await prisma.homeAssignment.findMany({
        where: { companyId: ctx.companyId, superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      allowedHomeIds = assignments.length > 0 ? assignments.map((a) => a.homeId) : []
    }

    const baseTaskWhere = {
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      scheduledDate: { gte: start, lte: end },
      status: { notIn: ["Canceled" as const] },
      ...(allowedHomeIds !== null ? { homeId: { in: allowedHomeIds } } : {}),
    }

    const [tasks, punchItems] = await Promise.all([
      prisma.homeTask.findMany({
        where: {
          ...baseTaskWhere,
          ...(subdivisionIdParam
            ? { home: { subdivisionId: subdivisionIdParam } }
            : {}),
        },
        include: {
          home: {
            select: {
              id: true,
              addressOrLot: true,
              subdivision: { select: { name: true } },
            },
          },
        },
        orderBy: { scheduledDate: "asc" },
      }),
      prisma.punchItem.findMany({
        where: {
          dueDate: { gte: start, lte: end },
          status: { in: ["Open", "ReadyForReview"] },
          ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
          ...(allowedHomeIds !== null ? { homeId: { in: allowedHomeIds } } : {}),
          ...(subdivisionIdParam
            ? { home: { subdivisionId: subdivisionIdParam } }
            : {}),
        },
        include: {
          home: {
            select: {
              id: true,
              addressOrLot: true,
              subdivision: { select: { name: true } },
            },
          },
          relatedHomeTask: { select: { nameSnapshot: true } },
        },
        orderBy: { dueDate: "asc" },
      }),
    ])

    const taskEvents: CalendarEventPayload[] = tasks
      .filter((t) => t.scheduledDate != null)
      .map((task) => {
        const taskDate = new Date(task.scheduledDate!)
        const isCompleted = task.status === "Completed"
        const isOverdue = taskDate < today && !isCompleted
        return {
          id: task.id,
          date: format(taskDate, "yyyy-MM-dd"),
          type: "trade" as const,
          title: task.nameSnapshot,
          communityName: task.home.subdivision?.name ?? undefined,
          homeId: task.home.id,
          homeLabel: task.home.addressOrLot,
          status: isCompleted
            ? ("completed" as const)
            : isOverdue
              ? ("overdue" as const)
              : ("on_track" as const),
        }
      })

    const punchEvents: CalendarEventPayload[] = punchItems
      .filter((p) => p.dueDate != null)
      .map((p) => {
        const due = new Date(p.dueDate!)
        const isOverdue = due < today
        return {
          id: p.id,
          date: format(due, "yyyy-MM-dd"),
          type: "punchlist" as const,
          title: `${p.relatedHomeTask?.nameSnapshot ?? "Task"}: ${p.title}`,
          communityName: p.home.subdivision?.name ?? undefined,
          homeId: p.home.id,
          homeLabel: p.home.addressOrLot,
          status: isOverdue ? ("overdue" as const) : ("on_track" as const),
        }
      })

    const events = [...taskEvents, ...punchEvents].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    return NextResponse.json(events)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
