import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { requireTenantContext } from "@/lib/tenant"
import { createAuditLog } from "@/lib/audit"
import {
  createAssistantScheduledTaskEvent,
  createAssistantCreatedPunchlistEvent,
  createAssistantCreatedMaterialRequestEvent,
} from "@/lib/activity"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const scheduleTaskPayload = z.object({
  action: z.literal("schedule_task"),
  homeId: z.string(),
  taskId: z.string(),
  scheduledDate: z.string(),
  contractorId: z.string().nullable().optional(),
})

const punchlistPayload = z.object({
  action: z.literal("create_punchlist"),
  homeId: z.string(),
  taskId: z.string(),
  items: z.array(z.object({ title: z.string(), description: z.string().optional() })),
  dueDate: z.string().nullable().optional(),
})

const materialRequestPayload = z.object({
  action: z.literal("create_material_request"),
  homeId: z.string().nullable(),
  material: z.string(),
  quantity: z.string().optional(),
  neededBy: z.string().nullable().optional(),
})

async function getAllowedHomeIds(
  companyId: string,
  userId: string,
  role: string
): Promise<string[]> {
  if (role === "Superintendent") {
    const { prisma } = await import("@/lib/prisma")
    const assignments = await prisma.homeAssignment.findMany({
      where: { companyId, superintendentUserId: userId },
      select: { homeId: true },
    })
    return assignments.map((a) => a.homeId)
  }
  const { prisma } = await import("@/lib/prisma")
  const homes = await prisma.home.findMany({
    where: { companyId },
    select: { id: true },
  })
  return homes.map((h) => h.id)
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()
    if (!["Admin", "Manager", "Superintendent"].includes(ctx.role)) {
      return NextResponse.json(
        { error: "Assistant is available only for Admin, Manager, and Superintendent." },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const action = body?.action

    if (action === "schedule_task") {
      const parsed = scheduleTaskPayload.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid payload", details: parsed.error.flatten() },
          { status: 400 }
        )
      }
      const { homeId, taskId, scheduledDate, contractorId } = parsed.data
      const allowedHomeIds = await getAllowedHomeIds(ctx.companyId, ctx.userId, ctx.role)
      if (!allowedHomeIds.includes(homeId)) {
        return NextResponse.json({ error: "You do not have permission to schedule this home." }, { status: 403 })
      }

      const { prisma } = await import("@/lib/prisma")
      const task = await prisma.homeTask.findFirst({
        where: { id: taskId, homeId },
        include: { home: true, templateItem: { select: { name: true } } },
      })
      if (!task) {
        return NextResponse.json({ error: "Task not found." }, { status: 404 })
      }

      const res = await fetch(
        `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/tasks/${taskId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            cookie: request.headers.get("cookie") ?? "",
          },
          body: JSON.stringify({
            scheduledDate: scheduledDate.endsWith("Z") ? scheduledDate : `${scheduledDate}T12:00:00.000Z`,
            contractorId: contractorId ?? undefined,
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return NextResponse.json(
          { error: err.error ?? "Failed to schedule task" },
          { status: res.status }
        )
      }
      const updated = await res.json()
      await createAssistantScheduledTaskEvent({
        companyId: ctx.companyId,
        userId: ctx.userId,
        homeId,
        taskId,
        taskName: task.nameSnapshot,
        scheduledDate,
      })
      const homeLabel = (updated.home as { addressOrLot?: string })?.addressOrLot ?? "Home"
      return NextResponse.json({
        success: true,
        message: `${task.nameSnapshot} scheduled for ${homeLabel} on ${new Date(scheduledDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}.`,
        taskId,
        homeId,
        scheduledDate,
      })
    }

    if (action === "create_punchlist") {
      const parsed = punchlistPayload.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid payload", details: parsed.error.flatten() },
          { status: 400 }
        )
      }
      const { homeId, taskId, items } = parsed.data
      const allowedHomeIds = await getAllowedHomeIds(ctx.companyId, ctx.userId, ctx.role)
      if (!allowedHomeIds.includes(homeId)) {
        return NextResponse.json({ error: "You do not have permission to add punchlist for this home." }, { status: 403 })
      }

      const { prisma } = await import("@/lib/prisma")
      const task = await prisma.homeTask.findFirst({
        where: { id: taskId, homeId },
        include: { home: true },
      })
      if (!task) {
        return NextResponse.json({ error: "Task not found." }, { status: 404 })
      }

      const cookieHeader = request.headers.get("cookie") ?? ""
      const createdIds: string[] = []
      for (const item of items) {
        const res = await fetch(
          `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/tasks/${taskId}/punch-items`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie: cookieHeader },
            body: JSON.stringify({
              title: item.title,
              description: item.description ?? null,
            }),
          }
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          return NextResponse.json(
            { error: err.error ?? "Failed to create punch item" },
            { status: res.status }
          )
        }
        const created = await res.json()
        createdIds.push(created.id)
      }
      await createAssistantCreatedPunchlistEvent({
        companyId: ctx.companyId,
        userId: ctx.userId,
        homeId,
        taskId,
        punchItemIds: createdIds,
      })
      const homeLabel = (task.home as { addressOrLot?: string })?.addressOrLot ?? "Home"
      return NextResponse.json({
        success: true,
        message: `Punchlist created for ${homeLabel} (${items.length} item(s)).`,
        taskId,
        homeId,
        punchItemIds: createdIds,
      })
    }

    if (action === "create_material_request") {
      const parsed = materialRequestPayload.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid payload", details: parsed.error.flatten() },
          { status: 400 }
        )
      }
      const { homeId, material, quantity } = parsed.data
      if (homeId) {
        const allowedHomeIds = await getAllowedHomeIds(ctx.companyId, ctx.userId, ctx.role)
        if (!allowedHomeIds.includes(homeId)) {
          return NextResponse.json({ error: "You do not have permission for this home." }, { status: 403 })
        }
      }

      await createAuditLog(
        ctx.userId,
        "MaterialRequestDraft",
        `draft-${Date.now()}`,
        "CREATE",
        null,
        {
          homeId,
          material,
          quantity: quantity ?? null,
          neededBy: parsed.data.neededBy ?? null,
          source: "assistant",
        },
        ctx.companyId
      )
      if (homeId) {
        await createAssistantCreatedMaterialRequestEvent({
          companyId: ctx.companyId,
          userId: ctx.userId,
          homeId,
          material,
          quantity: quantity ?? null,
        })
      }
      return NextResponse.json({
        success: true,
        message: `Material request draft saved: ${material}${quantity ? ` (${quantity})` : ""}. No purchase order submitted.`,
        homeId,
      })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (error) {
    return handleApiError(error)
  }
}
