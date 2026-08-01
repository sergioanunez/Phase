import { NextRequest, NextResponse } from "next/server"
import { format, parseISO, startOfDay } from "date-fns"
import { TaskStatus } from "@prisma/client"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { handleApiError } from "@/lib/api-response"
import { classifyCalendarTaskType } from "@/lib/calendar/classify-event"
import {
  homeTaskWhereFromCalendarFilters,
  parseCalendarQueryFilters,
  punchItemWhereFromCalendarFilters,
} from "@/lib/calendar/filters"

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
  contractorId?: string
  contractorName?: string
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
    const filters = parseCalendarQueryFilters(searchParams)

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

    const filterTaskWhere = homeTaskWhereFromCalendarFilters(filters)
    const filterPunchWhere = punchItemWhereFromCalendarFilters(filters)

    const baseTaskWhere = {
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      scheduledDate: { gte: start, lte: end },
      status: { notIn: [TaskStatus.Canceled, TaskStatus.NotApplicable] },
      ...(allowedHomeIds !== null ? { homeId: { in: allowedHomeIds } } : {}),
      ...filterTaskWhere,
    }

    const [tasks, punchItems] = await Promise.all([
      prisma.homeTask.findMany({
        where: baseTaskWhere,
        include: {
          home: {
            select: {
              id: true,
              addressOrLot: true,
              subdivision: { select: { name: true } },
            },
          },
          contractor: { select: { id: true, companyName: true } },
          templateItem: {
            select: {
              optionalCategory: true,
              workTemplateCategory: { select: { name: true } },
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
          ...filterPunchWhere,
        },
        include: {
          home: {
            select: {
              id: true,
              addressOrLot: true,
              subdivision: { select: { name: true } },
            },
          },
          relatedHomeTask: {
            select: { nameSnapshot: true, contractorId: true },
          },
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
        const categoryName =
          task.templateItem?.workTemplateCategory?.name ??
          task.templateItem?.optionalCategory ??
          null
        const type = classifyCalendarTaskType({
          taskName: task.nameSnapshot,
          categoryName,
        })
        return {
          id: task.id,
          date: format(taskDate, "yyyy-MM-dd"),
          type,
          title: task.nameSnapshot,
          communityName: task.home.subdivision?.name ?? undefined,
          homeId: task.home.id,
          homeLabel: task.home.addressOrLot,
          contractorId: task.contractorId ?? task.contractor?.id ?? undefined,
          contractorName: task.contractor?.companyName ?? undefined,
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
          contractorId: p.relatedHomeTask?.contractorId ?? undefined,
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
