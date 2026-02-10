import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

// POST /api/tasks/[id]/punch-items/send-sms - Send punch list to contractors
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const user = await requirePermission("homes:write")
    
    const task = await prisma.homeTask.findUnique({
      where: { id: params.id },
      include: {
        home: {
          include: {
            subdivision: true,
          },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Get all punch items for this task (with photos for link inclusion)
    const punchItems = await prisma.punchItem.findMany({
      where: {
        relatedHomeTaskId: params.id,
        status: {
          in: ["Open", "ReadyForReview"],
        },
      },
      include: {
        assignedContractor: true,
        photos: { orderBy: { createdAt: "asc" } },
      },
      orderBy: {
        createdAt: "asc",
      },
    })

    if (punchItems.length === 0) {
      return NextResponse.json(
        { error: "No open punch items to send" },
        { status: 400 }
      )
    }

    // Base URL for photo links (no media sent, just links)
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get("x-forwarded-proto") && request.headers.get("host")
        ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`
        : new URL(request.url).origin)

    // Group punch items by contractor
    const itemsByContractor = punchItems.reduce((acc, item) => {
      const contractorId = item.assignedContractorId || "unassigned"
      if (!acc[contractorId]) {
        acc[contractorId] = {
          contractor: item.assignedContractor,
          items: [],
        }
      }
      acc[contractorId].items.push({
        title: item.title,
        dueDate: item.dueDate ? item.dueDate.toISOString() : null,
        photoUrls: (item.photos || []).map((p) => `${baseUrl}${p.imageUrl}`),
      })
      return acc
    }, {} as Record<string, { contractor: typeof punchItems[0]["assignedContractor"]; items: Array<{ title: string; dueDate: string | null; photoUrls: string[] }> }>)

    // Send SMS to each contractor
    const results = []
    const errors = []

    for (const [contractorId, data] of Object.entries(itemsByContractor)) {
      if (contractorId === "unassigned" || !data.contractor) {
        errors.push({
          contractor: "Unassigned",
          error: "Cannot send SMS to unassigned punch items",
        })
        continue
      }

      if (!data.contractor.phone) {
        errors.push({
          contractor: data.contractor.companyName,
          error: "Contractor does not have a phone number",
        })
        continue
      }

      try {
        const { sendPunchListSMS } = await import("@/lib/twilio")
        await sendPunchListSMS(
          params.id,
          data.contractor.phone,
          task.home.subdivision.name,
          task.home.addressOrLot,
          task.nameSnapshot,
          data.items
        )
        results.push({
          contractor: data.contractor.companyName,
          itemsCount: data.items.length,
          success: true,
        })
      } catch (error: any) {
        errors.push({
          contractor: data.contractor.companyName,
          error: error.message || "Failed to send SMS",
        })
      }
    }

    return NextResponse.json({
      success: results.length > 0,
      results,
      errors,
    })
  } catch (error: any) {
    console.error("Error sending punch list SMS:", error)
    return NextResponse.json(
      { error: error.message || "Failed to send punch list SMS" },
      { status: 500 }
    )
  }
}
