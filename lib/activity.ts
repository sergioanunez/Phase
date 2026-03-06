import { prisma } from "./prisma"
import type { ActivityEventType, Prisma } from "@prisma/client"

export type CreateActivityEventParams = {
  companyId: string
  homeId: string
  taskId?: string | null
  punchItemId?: string | null
  eventType: ActivityEventType
  title: string
  description?: string | null
  actorName?: string | null
  recipientName?: string | null
  metadata?: Record<string, unknown> | null
}

export async function createActivityEvent(params: CreateActivityEventParams): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: {
        companyId: params.companyId,
        homeId: params.homeId,
        taskId: params.taskId ?? undefined,
        punchItemId: params.punchItemId ?? undefined,
        eventType: params.eventType,
        title: params.title,
        description: params.description ?? undefined,
        actorName: params.actorName ?? undefined,
        recipientName: params.recipientName ?? undefined,
        metadataJson: params.metadata ? (params.metadata as Prisma.InputJsonValue) : undefined,
      },
    })
  } catch (error) {
    console.error("[createActivityEvent] Failed:", error)
  }
}

export async function createTaskScheduledEvent(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  scheduledDate: Date
  recipientName?: string | null
  actorName?: string | null
}): Promise<void> {
  await createActivityEvent({
    companyId: params.companyId,
    homeId: params.homeId,
    taskId: params.taskId,
    eventType: "task_scheduled",
    title: `${params.taskName} scheduled`,
    description: `Scheduled for ${params.scheduledDate.toLocaleDateString()}`,
    actorName: params.actorName,
    recipientName: params.recipientName,
  })
}

export async function createTaskCompletedEvent(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  actorName?: string | null
}): Promise<void> {
  await createActivityEvent({
    companyId: params.companyId,
    homeId: params.homeId,
    taskId: params.taskId,
    eventType: "task_completed",
    title: `${params.taskName} completed`,
    actorName: params.actorName,
  })
}

export async function createSmsSentEvent(params: {
  companyId: string
  homeId: string
  taskId?: string | null
  messageType: "scheduled" | "cancelled" | "punchlist"
  recipientName?: string | null
  taskName?: string | null
}): Promise<void> {
  const typeLabels = {
    scheduled: "Scheduled SMS sent",
    cancelled: "Cancelled SMS sent",
    punchlist: "Punchlist SMS sent",
  }
  const title = params.taskName
    ? `${typeLabels[params.messageType]} for ${params.taskName}`
    : typeLabels[params.messageType]

  await createActivityEvent({
    companyId: params.companyId,
    homeId: params.homeId,
    taskId: params.taskId,
    eventType: "sms_sent",
    title,
    recipientName: params.recipientName,
    metadata: { messageType: params.messageType },
  })
}

export async function createSmsConfirmationEvent(params: {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  confirmed: boolean
  recipientName?: string | null
}): Promise<void> {
  await createActivityEvent({
    companyId: params.companyId,
    homeId: params.homeId,
    taskId: params.taskId,
    eventType: params.confirmed ? "sms_confirmed" : "sms_declined",
    title: params.confirmed
      ? `${params.taskName} confirmed by SMS`
      : `${params.taskName} declined by SMS`,
    recipientName: params.recipientName,
  })
}

export async function createPunchlistSentEvent(params: {
  companyId: string
  homeId: string
  taskId?: string | null
  punchItemId?: string | null
  recipientName?: string | null
  itemCount?: number
}): Promise<void> {
  await createActivityEvent({
    companyId: params.companyId,
    homeId: params.homeId,
    taskId: params.taskId,
    punchItemId: params.punchItemId,
    eventType: "punchlist_sent",
    title: params.itemCount
      ? `Punchlist sent (${params.itemCount} item${params.itemCount > 1 ? "s" : ""})`
      : "Punchlist sent",
    recipientName: params.recipientName,
  })
}
