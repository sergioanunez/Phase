import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/rbac"
import { format, parseISO } from "date-fns"
import { TaskStatus } from "@prisma/client"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export type ContractorScheduleEventStatus =
  | "scheduled"
  | "completed"
  | "canceled"
  | "delayed"

export interface ContractorScheduleEventPunchItem {
  id: string
  title: string
  status: string
  severity: string
}

export interface ContractorScheduleEvent {
  id: string
  date: string
  title: string
  address: string
  communityName?: string
  homeId?: string
  workItemId: string
  status?: ContractorScheduleEventStatus
  contractorCompanyId: string
  notes?: string | null
  updatedAt?: string
  punchOpenCount?: number
  punchItems?: ContractorScheduleEventPunchItem[]
}

function taskStatusToEventStatus(status: TaskStatus): ContractorScheduleEventStatus {
  switch (status) {
    case "Completed":
      return "completed"
    case "Canceled":
      return "canceled"
    case "Scheduled":
    case "PendingConfirm":
    case "Confirmed":
    case "InProgress":
      return "scheduled"
    case "Unscheduled":
    case "Declined":
      return "canceled"
    default:
      return "scheduled"
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole("Subcontractor")

    if (!user.contractorId) {
      return NextResponse.json(
        { error: "User must be linked to a contractor" },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get("start")
    const endParam = searchParams.get("end")

    let start: Date
    let end: Date
    if (startParam && endParam) {
      start = parseISO(startParam)
      end = parseISO(endParam)
    } else {
      const now = new Date()
      const day = now.getUTCDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      const weekStart = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + mondayOffset
        )
      )
      start = weekStart
      end = new Date(
        Date.UTC(
          weekStart.getUTCFullYear(),
          weekStart.getUTCMonth(),
          weekStart.getUTCDate() + 6,
          23,
          59,
          59,
          999
        )
      )
    }

    const tasks = await prisma.homeTask.findMany({
      where: {
        ...(user.companyId ? { companyId: user.companyId } : {}),
        contractorId: user.contractorId,
        scheduledDate: { gte: start, lte: end },
        status: { notIn: ["Canceled"] },
      },
      include: {
        home: {
          select: {
            id: true,
            addressOrLot: true,
            subdivision: { select: { name: true } },
          },
        },
        punchItems: {
          where: { status: { in: ["Open", "ReadyForReview"] } },
          select: { id: true, title: true, status: true, severity: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ scheduledDate: "asc" }, { nameSnapshot: "asc" }],
    })

    const contractor = user.contractorId
      ? await prisma.contractor.findUnique({
          where: { id: user.contractorId },
          select: { companyName: true },
        })
      : null

    const events: ContractorScheduleEvent[] = tasks
      .filter((t) => t.scheduledDate != null)
      .map((task) => ({
        id: task.id,
        date: format(new Date(task.scheduledDate!), "yyyy-MM-dd"),
        title: task.nameSnapshot,
        address: task.home.addressOrLot,
        communityName: task.home.subdivision.name,
        homeId: task.home.id,
        workItemId: task.id,
        status: taskStatusToEventStatus(task.status),
        contractorCompanyId: user.contractorId!,
        notes: task.notes,
        updatedAt: task.updatedAt?.toISOString(),
        punchOpenCount: task.punchItems?.length ?? 0,
        punchItems: task.punchItems?.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          severity: p.severity,
        })) ?? [],
      }))

    return NextResponse.json({
      events,
      contractorCompanyName: contractor?.companyName ?? null,
    })
  } catch (error: unknown) {
    console.error("Contractor schedule error:", error)
    const message =
      error instanceof Error ? error.message : "Failed to fetch schedule"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
