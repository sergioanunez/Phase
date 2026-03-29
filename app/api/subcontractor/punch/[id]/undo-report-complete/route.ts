import { NextResponse } from "next/server"
import { PunchStatus } from "@prisma/client"
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
    const { canSubcontractorReportOnPunch } = await import("@/lib/subcontractor-report-access")

    const user = await requireRole("Subcontractor")

    const punch = await prisma.punchItem.findUnique({
      where: { id: params.id },
      include: {
        home: { select: { companyId: true } },
        relatedHomeTask: {
          select: {
            contractorId: true,
            companyId: true,
            home: { select: { companyId: true } },
          },
        },
      },
    })

    if (!punch) {
      return NextResponse.json({ error: "Punch item not found" }, { status: 404 })
    }

    const allowed = await canSubcontractorReportOnPunch(user.id, {
      assignedContractorId: punch.assignedContractorId,
      companyId: punch.companyId,
      home: { companyId: punch.home.companyId },
      relatedHomeTask: punch.relatedHomeTask,
    })
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (punch.status === PunchStatus.Closed || punch.status === PunchStatus.Canceled) {
      return NextResponse.json({ error: "Cannot undo after punch is closed" }, { status: 400 })
    }

    if (!punch.reportedCompleteAt) {
      return NextResponse.json({ error: "Nothing to undo" }, { status: 400 })
    }

    const updated = await prisma.punchItem.update({
      where: { id: params.id },
      data: {
        reportedCompleteAt: null,
        reportedCompleteByUserId: null,
        reportedCompleteNote: null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        assignedContractor: { select: { id: true, companyName: true } },
        closedBy: { select: { id: true, name: true } },
        reportedCompleteBy: { select: { id: true, name: true } },
        relatedHomeTask: {
          include: {
            home: { include: { subdivision: true } },
          },
        },
        photos: { orderBy: { createdAt: "asc" } },
      },
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to undo report"
    if (message === "Forbidden" || message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    console.error("undo-report-complete punch:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
