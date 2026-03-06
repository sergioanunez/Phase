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

    const dueDates = punchItems
      .map((p) => p.dueDate)
      .filter((d): d is Date => !!d)
    const earliestDue = dueDates.length > 0 ? dueDates.reduce((a, b) => (a < b ? a : b)) : null

    const { generatePublicPunchlistToken, buildPublicPunchlistUrl } = await import("@/lib/punchlists/publicLink")

    let share = await prisma.punchlistShare.findFirst({
      where: { homeTaskId: params.id, enabled: true },
      orderBy: { createdAt: "desc" },
    })
    if (!share) {
      const token = generatePublicPunchlistToken()
      share = await prisma.punchlistShare.create({
        data: {
          companyId: task.home.companyId ?? undefined,
          homeId: task.homeId,
          homeTaskId: params.id,
          token,
          enabled: true,
          dueDate: earliestDue ?? undefined,
          sentAt: new Date(),
        },
      })
    } else {
      await prisma.punchlistShare.update({
        where: { id: share.id },
        data: { dueDate: earliestDue ?? undefined, sentAt: new Date() },
      })
    }
    const publicLink = buildPublicPunchlistUrl(share.token)

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
        photoUrls: (item.photos || []).map((p) => p.imageUrl),
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

      const { getSmsRecipientForContractor, logSmsBlocked } = await import("@/lib/sms-guard")
      const recipient = await getSmsRecipientForContractor(data.contractor.id)
      if (!recipient.allowed) {
        logSmsBlocked(data.contractor.id, recipient.reason, { taskId: params.id, action: "punch_list_sms" })
        const msg =
          recipient.reason === "no_contact"
            ? "No contact has opted in to SMS for this vendor."
            : recipient.reason === "no_phone"
              ? "Contact has not added a phone number."
              : recipient.reason === "no_consent"
                ? "Contact has not opted in to SMS yet."
                : "Contact has unsubscribed from SMS."
        errors.push({ contractor: data.contractor.companyName, error: msg })
        continue
      }

      try {
        const { sendPunchListSMS } = await import("@/lib/twilio")
        await sendPunchListSMS(
          params.id,
          recipient.phoneE164,
          task.home.addressOrLot,
          task.nameSnapshot,
          data.items,
          { publicLink }
        )
        if (!share!.recipientPhone) {
          await prisma.punchlistShare.update({
            where: { id: share!.id },
            data: { recipientPhone: recipient.phoneE164 },
          })
        }
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
      publicLink: results.length > 0 ? publicLink : undefined,
    })
  } catch (error: any) {
    console.error("Error sending punch list SMS:", error)
    return NextResponse.json(
      { error: error.message || "Failed to send punch list SMS" },
      { status: 500 }
    )
  }
}
