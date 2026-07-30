import { z } from "zod"
import { PunchCategory, PunchSeverity, type Prisma } from "@prisma/client"
import {
  PermanentRejectionError,
  tenantScopedWhere,
  type AppliedEnvelope,
  type NoopEnvelope,
} from "@/lib/server-transactions"

export const punchItemCreateBodySchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  clientPunchItemId: z.string().min(8).max(128),
  homeTaskId: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional().nullable(),
  category: z.nativeEnum(PunchCategory).optional().nullable(),
  severity: z.nativeEnum(PunchSeverity).optional().nullable(),
  assignedContractorId: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  deviceCreatedAt: z.string().datetime().optional(),
  source: z.string().max(64).optional(),
})

export type PunchItemCreateBody = z.infer<typeof punchItemCreateBodySchema>

export type PunchItemCreateEntity = {
  id: string
  clientGeneratedId: string
  companyId: string
  homeId: string
  relatedHomeTaskId: string
  title: string
  description: string | null
  assignedContractorId: string | null
  assignedContractor: { id: string; companyName: string } | null
  status: string
  dueDate: string | null
  version: number
  createdAt: string
  createdBy: { id: string; name: string | null }
}

const punchInclude = {
  createdBy: { select: { id: true, name: true } },
  assignedContractor: { select: { id: true, companyName: true } },
} as const

function toEntity(
  row: {
    id: string
    clientGeneratedId: string | null
    companyId: string | null
    homeId: string
    relatedHomeTaskId: string
    title: string
    description: string | null
    assignedContractorId: string | null
    assignedContractor: { id: string; companyName: string } | null
    status: string
    dueDate: Date | null
    version: number
    createdAt: Date
    createdBy: { id: string; name: string | null }
  },
  clientPunchItemId: string,
  companyId: string
): PunchItemCreateEntity {
  return {
    id: row.id,
    clientGeneratedId: row.clientGeneratedId ?? clientPunchItemId,
    companyId: row.companyId ?? companyId,
    homeId: row.homeId,
    relatedHomeTaskId: row.relatedHomeTaskId,
    title: row.title,
    description: row.description,
    assignedContractorId: row.assignedContractorId,
    assignedContractor: row.assignedContractor,
    status: row.status,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  }
}

type Tx = Prisma.TransactionClient

/**
 * Authoritative PunchItem create for Transaction Engine.
 * Must run inside executeIdempotentMutation using context.tx only.
 */
export async function createPunchItemInTransaction(params: {
  tx: Tx
  companyId: string
  actorUserId: string
  idempotencyKey: string
  input: PunchItemCreateBody
}): Promise<AppliedEnvelope<PunchItemCreateEntity> | NoopEnvelope> {
  const { tx, companyId, actorUserId, idempotencyKey, input } = params

  const existingByClientId = await tx.punchItem.findFirst({
    where: {
      companyId,
      clientGeneratedId: input.clientPunchItemId,
    },
    include: punchInclude,
  })
  if (existingByClientId) {
    const entity = toEntity(existingByClientId, input.clientPunchItemId, companyId)
    return {
      status: "noop",
      idempotencyKey,
      entityId: entity.id,
      entityType: "PunchItem",
      entity,
      version: entity.version,
    }
  }

  const task = await tx.homeTask.findFirst({
    where: {
      id: input.homeTaskId,
      AND: [tenantScopedWhere(companyId)],
    },
    include: { home: { select: { id: true, addressOrLot: true, companyId: true } } },
  })

  if (!task) {
    throw new PermanentRejectionError({
      code: "NOT_FOUND",
      message: "Task not found",
      httpHint: "NOT_FOUND",
    })
  }

  const category = input.category ?? PunchCategory.Other
  const severity = input.severity ?? PunchSeverity.Minor

  let punchItem
  try {
    punchItem = await tx.punchItem.create({
      data: {
        companyId,
        homeId: task.homeId,
        relatedHomeTaskId: task.id,
        createdByUserId: actorUserId,
        clientGeneratedId: input.clientPunchItemId,
        assignedContractorId: input.assignedContractorId || null,
        category,
        severity,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: "Open",
      },
      include: punchInclude,
    })
  } catch (error) {
    // Concurrent create with same clientGeneratedId
    const raced = await tx.punchItem.findFirst({
      where: { companyId, clientGeneratedId: input.clientPunchItemId },
      include: punchInclude,
    })
    if (raced) {
      const entity = toEntity(raced, input.clientPunchItemId, companyId)
      return {
        status: "noop",
        idempotencyKey,
        entityId: entity.id,
        entityType: "PunchItem",
        entity,
        version: entity.version,
      }
    }
    throw error
  }

  const openPunchCount = await tx.punchItem.count({
    where: {
      relatedHomeTaskId: task.id,
      status: { in: ["Open", "ReadyForReview"] },
    },
  })

  await tx.homeTask.update({
    where: { id: task.id },
    data: {
      hasOpenPunch: openPunchCount > 0,
      punchOpenCount: openPunchCount,
    },
  })

  // Match legacy create: audit only (no ActivityEvent for normal UI create).
  await tx.auditLog.create({
    data: {
      userId: actorUserId,
      companyId,
      entityType: "PunchItem",
      entityId: punchItem.id,
      action: "CREATE",
      beforeJson: null,
      afterJson: JSON.stringify({
        id: punchItem.id,
        clientGeneratedId: input.clientPunchItemId,
        title: punchItem.title,
        relatedHomeTaskId: task.id,
      }),
    },
  })

  const entity = toEntity(punchItem, input.clientPunchItemId, companyId)
  return {
    status: "applied",
    idempotencyKey,
    entityId: entity.id,
    entityType: "PunchItem",
    entity,
    version: entity.version,
  }
}

export type PunchCreateNotifyContext = {
  companyId: string
  homeId: string
  taskId: string
  taskName: string
  homeLabel: string
  punchCount: number
  createdByUserId: string
}
