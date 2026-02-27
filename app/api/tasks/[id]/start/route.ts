import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
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

    const templateDeps = await prisma.templateDependency.findMany({
      where: {
        templateItemId: task.templateItemId,
        OR: ctx.companyId ? [{ companyId: ctx.companyId }, { companyId: null }] : [{ companyId: null }],
      },
      select: { dependsOnItemId: true },
    })

    if (templateDeps.length > 0) {
      const prereqTasks = await prisma.homeTask.findMany({
        where: {
          homeId: task.homeId,
          templateItemId: { in: templateDeps.map((d) => d.dependsOnItemId) },
        },
        select: { id: true, nameSnapshot: true, status: true },
      })
      const incomplete = prereqTasks.filter((t) => t.status !== "Completed")
      if (incomplete.length > 0) {
        const depNames = incomplete.map((t) => t.nameSnapshot).join(", ")
        return NextResponse.json(
          { error: `This task is locked until ${depNames} are complete.` },
          { status: 409 }
        )
      }
    }

    const updated = await prisma.homeTask.update({
      where: { id: params.id },
      data: { status: "InProgress" },
      include: {
        contractor: true,
        home: { include: { subdivision: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
