import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/rbac"
import { checkGateBlocking } from "@/lib/gates"
import { sendConfirmationSMS } from "@/lib/twilio"
import { format } from "date-fns"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requirePermission("sms:send")

    const task = await prisma.homeTask.findUnique({
      where: { id: params.id },
      include: {
        contractor: true,
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

    if (!task.contractorId || !task.contractor) {
      return NextResponse.json(
        { error: "Task must have a contractor assigned" },
        { status: 400 }
      )
    }

    if (!task.scheduledDate) {
      return NextResponse.json(
        { error: "Task must have a scheduled date" },
        { status: 400 }
      )
    }

    if (task.status !== "Scheduled" && task.status !== "PendingConfirm") {
      return NextResponse.json(
        { error: "Task must be Scheduled or PendingConfirm to send confirmation" },
        { status: 400 }
      )
    }

    // Check gate blocking (for ScheduleAndConfirm mode)
    const taskWithTemplate = await prisma.homeTask.findUnique({
      where: { id: params.id },
      include: {
        templateItem: {
          select: {
            isCriticalGate: true,
            gateBlockMode: true,
            optionalCategory: true,
          },
        },
      },
    })

    // Get all tasks for category-based blocking check
    const allTasks = await prisma.homeTask.findMany({
      where: { homeId: task.homeId },
      include: {
        templateItem: {
          select: {
            isCriticalGate: true,
            gateScope: true,
            gateBlockMode: true,
            gateName: true,
            optionalCategory: true,
          },
        },
      },
      orderBy: {
        sortOrderSnapshot: "asc",
      },
    })

    // Category-based blocking: all tasks in previous categories must be completed
    const currentTaskCategory = taskWithTemplate?.templateItem?.optionalCategory || "Uncategorized"
    const currentTaskIndex = allTasks.findIndex((t) => t.id === task.id)

    // Category order (same as in UI)
    const categoryOrder = [
      "Preliminary work",
      "Foundation",
      "Structural",
      "Interior finishes / exterior rough work",
      "Finals punches and inspections.",
      "Pre-sale completion package",
    ]

    // Get the index of the current category in the order
    const getCategoryIndex = (category: string | null): number => {
      const normalized = (category || "Uncategorized").toLowerCase().trim().replace("prelliminary", "preliminary")
      const index = categoryOrder.findIndex(
        (orderCat) => orderCat.toLowerCase().trim() === normalized
      )
      return index !== -1 ? index : 999 // Uncategorized goes last
    }

    const currentCategoryIndex = getCategoryIndex(currentTaskCategory)

    // Check category gates - only check categories that are marked as gates
    const categoryGates = await prisma.categoryGate.findMany()
    
    for (const categoryGate of categoryGates) {
      const gateCategoryIndex = getCategoryIndex(categoryGate.categoryName)
      
      // Only check gates for categories before the current task's category
      if (gateCategoryIndex >= currentCategoryIndex) {
        continue
      }

      // Check if this gate applies
      let gateApplies = false

      if (categoryGate.gateScope === "AllScheduling") {
        gateApplies = true
      } else if (categoryGate.gateScope === "DownstreamOnly") {
        // Gate applies to tasks after this category
        gateApplies = currentCategoryIndex > gateCategoryIndex
      }

      if (gateApplies) {
        // Check if all tasks in the gated category are completed
        const gatedCategoryTasks = allTasks.filter(
          (t) => (t.templateItem?.optionalCategory || "Uncategorized") === categoryGate.categoryName
        )

        const incompleteGatedTasks = gatedCategoryTasks.filter(
          (t) => t.status !== "Completed" && t.status !== "Canceled"
        )

        if (incompleteGatedTasks.length > 0) {
          const gateName = categoryGate.gateName || `${categoryGate.categoryName.replace(/Prelliminary/gi, "Preliminary")} Gate`
          const taskNames = incompleteGatedTasks.map((t) => t.nameSnapshot).join(", ")
          return NextResponse.json(
            {
              error: `Cannot send confirmation. All tasks in "${gateName}" must be completed first: ${taskNames}`,
              categoryBlocked: true,
            },
            { status: 400 }
          )
        }
      }
    }


    // Check if any gate with ScheduleAndConfirm mode is blocking

    const gateTasks = allTasks.filter(
      (t) => t.templateItem?.isCriticalGate && t.templateItem?.gateBlockMode === "ScheduleAndConfirm"
    )

    for (const gateTask of gateTasks) {
      const gateScope = gateTask.templateItem?.gateScope || "DownstreamOnly"
      let gateApplies = false

      if (gateScope === "AllScheduling") {
        gateApplies = true
      } else if (gateScope === "DownstreamOnly") {
        gateApplies = task.sortOrderSnapshot > gateTask.sortOrderSnapshot
      }

      if (gateApplies) {
        const openPunchCount = await prisma.punchItem.count({
          where: {
            relatedHomeTaskId: gateTask.id,
            status: {
              in: ["Open", "ReadyForReview"],
            },
          },
        })

        if (openPunchCount > 0) {
          const gateName = gateTask.templateItem?.gateName || "Critical Gate"
          return NextResponse.json(
            {
              error: `Cannot send confirmation. Scheduling blocked until "${gateName}" punchlist is cleared. ${openPunchCount} open punch item(s) remaining.`,
              gateBlocked: true,
              blockingGateName: gateName,
              openPunchCount,
            },
            { status: 409 }
          )
        }
      }
    }

    // Validate Twilio configuration
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      return NextResponse.json(
        { error: "Twilio is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables." },
        { status: 500 }
      )
    }

    // Validate phone number format
    const phone = task.contractor.phone.trim()
    if (!phone || phone.length < 10) {
      return NextResponse.json(
        { error: `Invalid phone number for contractor: ${phone}` },
        { status: 400 }
      )
    }

    const dateStr = format(new Date(task.scheduledDate), "MM/dd/yyyy")

    await sendConfirmationSMS(
      task.id,
      phone,
      task.home.subdivision.name,
      task.home.addressOrLot,
      task.nameSnapshot,
      dateStr
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Failed to send confirmation:", error)
    
    // Provide more specific error messages
    let errorMessage = "Failed to send confirmation SMS"
    if (error.message) {
      errorMessage = error.message
    } else if (error.code) {
      // Twilio-specific error codes
      switch (error.code) {
        case 21211:
          errorMessage = "Invalid phone number format. Please use E.164 format (e.g., +1234567890)"
          break
        case 21212:
          errorMessage = "Invalid 'to' phone number"
          break
        case 21214:
          errorMessage = "Invalid 'from' phone number"
          break
        case 21608:
          errorMessage = "Unverified phone number. Please verify the number in Twilio console"
          break
        case 21614:
          errorMessage = "Unsubscribed recipient. The phone number has opted out"
          break
        case 30007:
          errorMessage = "Invalid destination phone number"
          break
        default:
          errorMessage = `Twilio error (${error.code}): ${error.message || "Unknown error"}`
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
