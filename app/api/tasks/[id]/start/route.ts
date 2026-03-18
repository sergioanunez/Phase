import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { createTaskStartedEvent } from "@/lib/activity"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/** POST /api/tasks/[id]/start — set task status to InProgress (Flow quick action). Enforces dependency lock. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantContext } = await import("@/lib/tenant")
    const { hasPermission } = await import("@/lib/rbac")

    const ctx = await requireTenantContext()
    if (!hasPermission(ctx.role, "tasks:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const task = await prisma.homeTask.findFirst({
      where: {
        id: params.id,
        OR: [
          { companyId: ctx.companyId },
          { companyId: null, home: { companyId: ctx.companyId } },
        ],
      },
      include: {
        home: { select: { id: true } },
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    if (task.status === "InProgress") {
      return NextResponse.json({ error: "Task is already in progress" }, { status: 400 })
    }

    if (task.status === "Completed") {
      return NextResponse.json({ error: "Task is already completed" }, { status: 400 })
    }

    const { getIncompletePrerequisiteDependencyNames } = await import("@/lib/tasks/dependency-guard")
    const deps = await getIncompletePrerequisiteDependencyNames({
      prisma,
      homeId: task.homeId,
      templateItemId: task.templateItemId,
      companyId: ctx.companyId ?? null,
    })

    if (deps.length > 0) {
      const depNamesJoined = deps.join(", ")
      return NextResponse.json(
        {
          code: "DEPENDENCY_BLOCKED",
          dependencyBlocked: true,
          dependencies: deps,
          error: `Cannot start yet — this task depends on ${depNamesJoined} being complete.`,
        },
        { status: 409 }
      )
    }

    const updated = await prisma.homeTask.update({
      where: { id: params.id },
      data: {
        status: "InProgress",
        startedAt: task.startedAt ?? new Date(),
      },
      include: {
        contractor: true,
        home: { include: { subdivision: true } },
      },
    })

    // Log activity: task started
    if (ctx.companyId && updated.homeId) {
      await createTaskStartedEvent({
        companyId: ctx.companyId,
        homeId: updated.homeId,
        taskId: updated.id,
        taskName: updated.nameSnapshot,
        actorName: ctx.userId,
      })
    }

    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
