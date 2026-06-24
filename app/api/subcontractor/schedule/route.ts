import { NextRequest, NextResponse } from "next/server"
import { format, parseISO } from "date-fns"
import { TaskStatus } from "@prisma/client"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

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
  reportedCompleteAt?: string | null
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
  tenantId: string
  tenantName: string
  notes?: string | null
  updatedAt?: string
  punchOpenCount?: number
  punchItems?: ContractorScheduleEventPunchItem[]
  /** Subcontractor reported complete; tenant has not verified (task still open). */
  reportedCompleteAt?: string | null
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
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireRole } = await import("@/lib/rbac")
    const user = await requireRole("Subcontractor")

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

    const { listSubcontractorTenantsForUser } = await import(
      "@/lib/subcontractor-tenants"
    )
    const tenantRows = await listSubcontractorTenantsForUser(user.id)

    if (tenantRows.length === 0) {
      return NextResponse.json(
        { error: "No subcontractor memberships configured" },
        { status: 400 }
      )
    }

    const companyFilter = searchParams.get("companyId")
    const effectiveTenants =
      companyFilter && companyFilter !== "all"
        ? tenantRows.filter((t) => t.companyId === companyFilter)
        : tenantRows

    if (effectiveTenants.length === 0) {
      return NextResponse.json({ events: [], contractorCompanyName: null })
    }

    const companyIds = effectiveTenants.map((t) => t.companyId)
    const contractorIds = effectiveTenants.map((t) => t.contractorId)

    const tasks = await prisma.homeTask.findMany({
      where: {
        AND: [
          {
            OR: [
              { companyId: { in: companyIds } },
              { companyId: null, home: { companyId: { in: companyIds } } },
            ],
          },
          { contractorId: { in: contractorIds } },
          { scheduledDate: { gte: start, lte: end } },
          { status: { notIn: ["Canceled", "NotApplicable"] as const } },
        ],
      },
      include: {
        company: { select: { id: true, name: true } },
        home: {
          select: {
            id: true,
            companyId: true,
            addressOrLot: true,
            subdivision: { select: { name: true } },
            company: { select: { id: true, name: true } },
          },
        },
        punchItems: {
          where: { status: { in: ["Open", "ReadyForReview"] } },
          select: {
            id: true,
            title: true,
            status: true,
            severity: true,
            reportedCompleteAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ scheduledDate: "asc" }, { nameSnapshot: "asc" }],
    })

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
        contractorCompanyId: task.contractorId!,
        tenantId: task.companyId ?? task.home.companyId ?? "",
        tenantName:
          task.company?.name ?? task.home.company?.name ?? "",
        notes: task.notes,
        updatedAt: task.updatedAt?.toISOString(),
        punchOpenCount: task.punchItems?.length ?? 0,
        punchItems: task.punchItems?.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          severity: p.severity,
          reportedCompleteAt: p.reportedCompleteAt?.toISOString() ?? null,
        })) ?? [],
        reportedCompleteAt: task.reportedCompleteAt?.toISOString() ?? null,
      }))

    return NextResponse.json({
      events,
      contractorCompanyName: null,
    })
  } catch (error: unknown) {
    console.error("Contractor schedule error:", error)
    const message =
      error instanceof Error ? error.message : "Failed to fetch schedule"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
