import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/rbac"
import { sendPunchListSMS } from "@/lib/twilio"

// POST /api/tasks/[id]/punch-items/send-sms - Send punch list to contractors
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
