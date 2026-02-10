import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/rbac"
import { sendCancellationSMS } from "@/lib/twilio"
import { format } from "date-fns"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

function jsonResponse(body: unknown, status: number) {
  try {
    const text = JSON.stringify(body)
    return new NextResponse(text, {
      status,
      headers: { "Content-Type": "application/json" },
    })
  } catch {
    return new NextResponse(
      JSON.stringify({ error: "Failed to cancel schedule" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params?: Promise<{ id: string }> | { id: string } }
) {
  try {
    let taskId: string
    try {
      const params = context?.params
      if (params == null) {
        return jsonResponse({ error: "Missing route params" }, 400)
      }
      const resolved = await Promise.resolve(params)
      taskId = resolved?.id
      if (typeof taskId !== "string" || !taskId) {
        return jsonResponse({ error: "Invalid task id" }, 400)
      }
    } catch (e) {
      console.error("Cancel schedule params error:", e)
      return jsonResponse({ error: "Invalid request" }, 400)
    }

    try {
      await requirePermission("tasks:write")
    } catch (authError: unknown) {
      const msg =
        authError instanceof Error ? authError.message : "Unauthorized"
      const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500
      console.error("Cancel schedule auth error:", authError)
      return jsonResponse({ error: msg }, status)
    }

    const task = await prisma.homeTask.findUnique({
      where: { id: taskId },
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
      return jsonResponse({ error: "Task not found" }, 404)
    }

    if (!task.scheduledDate) {
      return jsonResponse(
        { error: "Task does not have a scheduled date" },
        400
      )
    }

    // Send cancellation SMS if task is Confirmed and has a contractor
    if (task.status === "Confirmed" && task.contractor) {
      try {
        const dateStr = format(new Date(task.scheduledDate), "MM/dd/yyyy")
        await sendCancellationSMS(
          task.id,
          task.contractor.phone,
          task.home.subdivision.name,
          task.home.addressOrLot,
          task.nameSnapshot,
          dateStr
        )
      } catch (smsError: unknown) {
        console.error("Failed to send cancellation SMS:", smsError)
        // Continue with cancellation even if SMS fails
      }
    }

    // Update task to cancel schedule
    const updatedTask = await prisma.homeTask.update({
      where: { id: taskId },
      data: {
        scheduledDate: null,
        contractorId: null,
        status: "Unscheduled",
      },
      include: {
        contractor: true,
        home: {
          include: {
            subdivision: true,
          },
        },
      },
    })

    return jsonResponse(updatedTask, 200)
  } catch (error: unknown) {
    console.error("Cancel schedule error (full):", error)
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to cancel schedule"
    return jsonResponse({ error: message }, 500)
  }
}
