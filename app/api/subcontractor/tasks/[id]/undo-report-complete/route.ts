import { NextResponse } from "next/server"
import { TaskStatus } from "@prisma/client"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireRole } = await import("@/lib/rbac")
    const { canSubcontractorReportOnTask } = await import("@/lib/subcontractor-report-access")

    const user = await requireRole("Subcontractor")

    const task = await prisma.homeTask.findUnique({
      where: { id: params.id },
      include: {
        home: { select: { companyId: true } },
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const allowed = await canSubcontractorReportOnTask(user.id, {
      contractorId: task.contractorId,
      companyId: task.companyId,
      home: { companyId: task.home.companyId },
    })
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (task.status === TaskStatus.Completed) {
      return NextResponse.json({ error: "Cannot undo after task is verified complete" }, { status: 400 })
    }

    if (!task.reportedCompleteAt) {
      return NextResponse.json({ error: "Nothing to undo" }, { status: 400 })
    }

    const updated = await prisma.homeTask.update({
      where: { id: params.id },
      data: {
        reportedCompleteAt: null,
        reportedCompleteByUserId: null,
        reportedCompleteNote: null,
      },
      include: {
        home: { include: { subdivision: true } },
        contractor: true,
        templateItem: true,
        lastRescheduledBy: { select: { id: true, name: true } },
        reportedCompleteBy: { select: { id: true, name: true } },
        smsMessages: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to undo report"
    if (message === "Forbidden" || message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    console.error("undo-report-complete task:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
