/**
 * Persistent PunchList create / add-item / update.
 * Online transactional paths; does not dual-submit with Transaction Engine.
 */

import { z } from "zod"
import { PunchCategory, PunchSeverity, type Prisma } from "@prisma/client"
import { PermanentRejectionError, tenantScopedWhere } from "@/lib/server-transactions"

export const punchListItemInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional().nullable(),
  clientPunchItemId: z.string().min(8).max(128).optional(),
})

export const createPunchListBodySchema = z.object({
  assignedContractorId: z.string().min(1),
  dueDate: z.string().datetime().optional().nullable(),
  clientPunchListId: z.string().min(8).max(128).optional(),
  items: z.array(punchListItemInputSchema).min(1).max(100),
})

export type CreatePunchListBody = z.infer<typeof createPunchListBodySchema>

export const addPunchListItemBodySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional().nullable(),
  clientPunchItemId: z.string().min(8).max(128).optional(),
})

export const updatePunchListBodySchema = z.object({
  assignedContractorId: z.string().min(1).optional(),
  dueDate: z.string().datetime().optional().nullable(),
})

const listInclude = {
  assignedContractor: { select: { id: true, companyName: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    include: {
      createdBy: { select: { id: true, name: true } },
      assignedContractor: { select: { id: true, companyName: true } },
      closedBy: { select: { id: true, name: true } },
      reportedCompleteBy: { select: { id: true, name: true } },
      photos: { orderBy: { createdAt: "asc" as const } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const

type Tx = Prisma.TransactionClient

async function refreshTaskPunchCounts(tx: Tx, taskId: string) {
  const openPunchCount = await tx.punchItem.count({
    where: {
      relatedHomeTaskId: taskId,
      status: { in: ["Open", "ReadyForReview"] },
    },
  })
  await tx.homeTask.update({
    where: { id: taskId },
    data: {
      hasOpenPunch: openPunchCount > 0,
      punchOpenCount: openPunchCount,
    },
  })
  return openPunchCount
}

/**
 * Create one PunchList + N PunchItems in a single DB transaction.
 */
export async function createPunchListWithItems(params: {
  tx: Tx
  companyId: string
  actorUserId: string
  homeTaskId: string
  input: CreatePunchListBody
}) {
  const { tx, companyId, actorUserId, homeTaskId, input } = params

  if (input.clientPunchListId) {
    const existing = await tx.punchList.findFirst({
      where: { companyId, clientGeneratedId: input.clientPunchListId },
      include: listInclude,
    })
    if (existing) return { list: existing, created: false as const }
  }

  const task = await tx.homeTask.findFirst({
    where: {
      id: homeTaskId,
      AND: [tenantScopedWhere(companyId)],
    },
    include: { home: { select: { id: true, companyId: true, addressOrLot: true } } },
  })
  if (!task) {
    throw new PermanentRejectionError({
      code: "NOT_FOUND",
      message: "Task not found",
      httpHint: "NOT_FOUND",
    })
  }

  const contractor = await tx.contractor.findFirst({
    where: {
      id: input.assignedContractorId,
      OR: [{ companyId }, { companyId: null }],
    },
  })
  if (!contractor) {
    throw new PermanentRejectionError({
      code: "VALIDATION",
      message: "Contractor not found",
      httpHint: "VALIDATION",
    })
  }

  const dueDate = input.dueDate ? new Date(input.dueDate) : null

  const list = await tx.punchList.create({
    data: {
      companyId,
      homeId: task.homeId,
      homeTaskId: task.id,
      assignedContractorId: contractor.id,
      dueDate,
      createdByUserId: actorUserId,
      clientGeneratedId: input.clientPunchListId ?? null,
    },
  })

  for (const item of input.items) {
    await tx.punchItem.create({
      data: {
        companyId,
        homeId: task.homeId,
        relatedHomeTaskId: task.id,
        punchListId: list.id,
        createdByUserId: actorUserId,
        assignedContractorId: contractor.id,
        clientGeneratedId: item.clientPunchItemId ?? null,
        category: PunchCategory.Other,
        severity: PunchSeverity.Minor,
        title: item.title.trim(),
        description: item.description ?? null,
        dueDate,
        status: "Open",
      },
    })
  }

  await refreshTaskPunchCounts(tx, task.id)

  const full = await tx.punchList.findFirstOrThrow({
    where: { id: list.id },
    include: listInclude,
  })

  return { list: full, created: true as const, task }
}

/**
 * Add one PunchItem to an existing PunchList (same contractor / due inherited).
 */
export async function addItemToPunchList(params: {
  tx: Tx
  companyId: string
  actorUserId: string
  punchListId: string
  title: string
  description?: string | null
  clientPunchItemId?: string
}) {
  const { tx, companyId, actorUserId, punchListId, title, description, clientPunchItemId } =
    params

  if (clientPunchItemId) {
    const existing = await tx.punchItem.findFirst({
      where: { companyId, clientGeneratedId: clientPunchItemId },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedContractor: { select: { id: true, companyName: true } },
        photos: true,
      },
    })
    if (existing) return { item: existing, created: false as const }
  }

  const list = await tx.punchList.findFirst({
    where: { id: punchListId, companyId },
  })
  if (!list) {
    throw new PermanentRejectionError({
      code: "NOT_FOUND",
      message: "Punch list not found",
      httpHint: "NOT_FOUND",
    })
  }
  if (!list.homeTaskId) {
    throw new PermanentRejectionError({
      code: "VALIDATION",
      message: "Punch list has no originating task",
      httpHint: "VALIDATION",
    })
  }

  const item = await tx.punchItem.create({
    data: {
      companyId,
      homeId: list.homeId,
      relatedHomeTaskId: list.homeTaskId,
      punchListId: list.id,
      createdByUserId: actorUserId,
      assignedContractorId: list.assignedContractorId,
      clientGeneratedId: clientPunchItemId ?? null,
      category: PunchCategory.Other,
      severity: PunchSeverity.Minor,
      title: title.trim(),
      description: description ?? null,
      dueDate: list.dueDate,
      status: "Open",
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignedContractor: { select: { id: true, companyName: true } },
      photos: true,
    },
  })

  await refreshTaskPunchCounts(tx, list.homeTaskId)
  await tx.punchList.update({
    where: { id: list.id },
    data: { updatedAt: new Date() },
  })

  return { item, created: true as const, list }
}

/**
 * Update list-level contractor / due date and cascade to member items.
 */
export async function updatePunchList(params: {
  tx: Tx
  companyId: string
  punchListId: string
  assignedContractorId?: string
  dueDate?: string | null
}) {
  const { tx, companyId, punchListId } = params

  const list = await tx.punchList.findFirst({
    where: { id: punchListId, companyId },
    include: { _count: { select: { items: true } } },
  })
  if (!list) {
    throw new PermanentRejectionError({
      code: "NOT_FOUND",
      message: "Punch list not found",
      httpHint: "NOT_FOUND",
    })
  }

  const data: Prisma.PunchListUpdateInput = {}
  const itemData: { assignedContractorId?: string | null; dueDate?: Date | null } = {}

  if (params.assignedContractorId !== undefined) {
    const contractor = await tx.contractor.findFirst({
      where: {
        id: params.assignedContractorId,
        OR: [{ companyId }, { companyId: null }],
      },
    })
    if (!contractor) {
      throw new PermanentRejectionError({
        code: "VALIDATION",
        message: "Contractor not found",
        httpHint: "VALIDATION",
      })
    }
    data.assignedContractor = { connect: { id: contractor.id } }
    itemData.assignedContractorId = contractor.id
  }

  if (params.dueDate !== undefined) {
    const due = params.dueDate ? new Date(params.dueDate) : null
    data.dueDate = due
    itemData.dueDate = due
  }

  await tx.punchList.update({
    where: { id: list.id },
    data,
  })

  if (Object.keys(itemData).length > 0) {
    await tx.punchItem.updateMany({
      where: { punchListId: list.id, companyId },
      data: itemData,
    })
  }

  return tx.punchList.findFirstOrThrow({
    where: { id: list.id },
    include: listInclude,
  })
}

export { listInclude as punchListInclude }

/** Pure helpers for UI grouping / counts (tested without DB). */
export function isPunchItemOpenStatus(status: string): boolean {
  return status === "Open" || status === "ReadyForReview"
}

export function countOpenPunchItems<T extends { status: string }>(items: T[]): number {
  return items.filter((i) => isPunchItemOpenStatus(i.status)).length
}

export function countClosedPunchItems<T extends { status: string }>(items: T[]): number {
  return items.filter((i) => i.status === "Closed" || i.status === "Canceled").length
}
