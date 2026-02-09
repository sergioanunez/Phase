import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireTenantPermission } from "@/lib/rbac"
import { getAssignedHomeIdsForContractor } from "@/lib/tenant"
import { getHomeGateStatus } from "@/lib/gates"
import { handleApiError } from "@/lib/api-response"

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantPermission("dashboard:view")

    const { searchParams } = new URL(request.url)
    const subdivisionId = searchParams.get("subdivisionId")

    const where: { companyId: string; subdivisionId?: string; id?: { in: string[] } } = {
      companyId: ctx.companyId,
    }
    if (subdivisionId) {
      where.subdivisionId = subdivisionId
    }

    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { companyId: ctx.companyId, superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      where.id = { in: assignments.map((a) => a.homeId) }
    }

    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      const assignedHomeIds = await getAssignedHomeIdsForContractor(ctx.companyId, ctx.contractorId)
      if (assignedHomeIds.length === 0) {
        return NextResponse.json({
          homes: [],
          summary: { totalHomes: 0, homesBehindSchedule: 0, averageProgress: 0 },
        })
      }
      where.id = { in: assignedHomeIds }
    }

    const homes = await prisma.home.findMany({
      where,
      include: {
        subdivision: true,
        tasks: {
          select: {
            id: true,
            status: true,
            scheduledDate: true,
            completedAt: true,
            nameSnapshot: true,
            hasOpenPunch: true,
            punchOpenCount: true,
          },
        },
      },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dashboardData = await Promise.all(
      homes.map(async (home) => {
        const totalTasks = home.tasks.length
        const canceledTasks = home.tasks.filter(
          (t) => t.status === "Canceled"
        ).length
        const completedTasks = home.tasks.filter(
          (t) => t.status === "Completed"
        ).length

        const progress =
          totalTasks - canceledTasks > 0
            ? (completedTasks / (totalTasks - canceledTasks)) * 100
            : 0

        // Behind schedule: status ≠ Completed AND scheduledDate < today
        const behindSchedule = home.tasks.some(
          (task) =>
            task.status !== "Completed" &&
            task.scheduledDate &&
            new Date(task.scheduledDate) < today
        )

        // Next work concept: earliest scheduledDate with status ∈ [Scheduled, PendingConfirm, Confirmed]
        const nextTasks = home.tasks
          .filter(
            (task) =>
              task.scheduledDate &&
              ["Scheduled", "PendingConfirm", "Confirmed"].includes(task.status)
          )
          .sort(
            (a, b) =>
              new Date(a.scheduledDate!).getTime() -
              new Date(b.scheduledDate!).getTime()
          )

        const nextTask = nextTasks[0] || null

        // Get gate statuses
        const gateStatuses = await getHomeGateStatus(home.id)
        const hasBlockedGate = gateStatuses.some((gate) => gate.isBlocked)
        const totalOpenPunch = home.tasks.reduce(
          (sum, task) => sum + (task.punchOpenCount || 0),
          0
        )

        return {
          homeId: home.id,
          addressOrLot: home.addressOrLot,
          subdivision: home.subdivision.name,
          progress: Math.round(progress),
          behindSchedule,
          nextTask: nextTask
            ? {
                id: nextTask.id,
                scheduledDate: nextTask.scheduledDate,
                status: nextTask.status,
                nameSnapshot: nextTask.nameSnapshot,
              }
            : null,
          totalTasks,
          completedTasks,
          canceledTasks,
          hasBlockedGate,
          gateStatuses,
          totalOpenPunch,
        }
      })
    )

    return NextResponse.json({
      homes: dashboardData,
      summary: {
        totalHomes: dashboardData.length,
        homesBehindSchedule: dashboardData.filter((h) => h.behindSchedule).length,
        averageProgress:
          dashboardData.length > 0
            ? Math.round(
                dashboardData.reduce((sum, h) => sum + h.progress, 0) /
                  dashboardData.length
              )
            : 0,
      },
    })
  } catch (error: any) {
    return handleApiError(error)
  }
}
