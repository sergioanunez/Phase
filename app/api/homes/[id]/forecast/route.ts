import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/rbac"
import { computeHomeForecast } from "@/lib/forecast"
import { getTaskSchedulingBlockReasonsBatch } from "@/lib/scheduling-block"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Any role that can read homes can read the forecast
    await requirePermission("homes:read")

    let forecastError: string | null = null
    try {
      await computeHomeForecast(params.id)
    } catch (err: any) {
      forecastError = err.message || "Failed to compute forecast"
      // Still load home and tasks so the list can be shown
    }

    const home = await prisma.home.findUnique({
      where: { id: params.id },
      include: {
        subdivision: true,
        tasks: {
          include: {
            contractor: true,
            templateItem: {
              select: {
                id: true,
                name: true,
                optionalCategory: true,
                isDependency: true,
              },
            },
          },
          orderBy: { sortOrderSnapshot: "asc" },
        },
      },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    // Compute scheduling block reason for each task (batched: one set of DB calls for all tasks)
    const tasksForBlockCheck = home.tasks.map((t) => ({
      id: t.id,
      templateItemId: t.templateItemId,
      sortOrderSnapshot: t.sortOrderSnapshot,
      nameSnapshot: t.nameSnapshot,
      status: t.status,
      templateItem: t.templateItem
        ? {
            optionalCategory: t.templateItem.optionalCategory,
            isDependency: t.templateItem.isDependency,
          }
        : null,
    }))
    const blockReasons = await getTaskSchedulingBlockReasonsBatch(
      home.id,
      tasksForBlockCheck
    )
    const tasksWithBlockReason = home.tasks.map((t) => ({
      ...t,
      schedulingBlockedReason: blockReasons.get(t.id) ?? null,
    }))

    // Expose plan/thumbnail metadata; do not send storage paths to client
    const { planStoragePath: _p, thumbnailStoragePath: _t, ...rest } = home
    return NextResponse.json({
      ...rest,
      hasPlan: !!home.planStoragePath,
      hasThumbnail: !!home.thumbnailStoragePath,
      tasks: tasksWithBlockReason,
      ...(forecastError ? { forecastError } : {}),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch forecast" },
      { status: 500 }
    )
  }
}

