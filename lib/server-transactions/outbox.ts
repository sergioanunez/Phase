import type { OutboxMessage, Prisma, PrismaClient } from "@prisma/client"
import { SERVER_TX_POLICY, type OutboxType } from "@/lib/server-transactions/types"

type Tx = Prisma.TransactionClient

export type EnqueueOutboxParams = {
  companyId: string
  type: OutboxType | string
  deduplicationKey: string
  aggregateType?: string
  aggregateId?: string
  payload: Prisma.InputJsonValue
  maxAttempts?: number
}

/**
 * Insert an outbox row inside an existing interactive transaction.
 * Duplicate (companyId, deduplicationKey) is a no-op that returns the existing row.
 */
export async function enqueueOutboxMessage(
  tx: Tx,
  params: EnqueueOutboxParams
): Promise<OutboxMessage> {
  const existing = await tx.outboxMessage.findUnique({
    where: {
      companyId_deduplicationKey: {
        companyId: params.companyId,
        deduplicationKey: params.deduplicationKey,
      },
    },
  })
  if (existing) return existing

  try {
    return await tx.outboxMessage.create({
      data: {
        companyId: params.companyId,
        type: params.type,
        deduplicationKey: params.deduplicationKey,
        aggregateType: params.aggregateType ?? null,
        aggregateId: params.aggregateId ?? null,
        payload: params.payload,
        maxAttempts: params.maxAttempts ?? SERVER_TX_POLICY.maxOutboxAttempts,
        status: "pending",
        nextAttemptAt: new Date(),
      },
    })
  } catch (error) {
    const raced = await tx.outboxMessage.findUnique({
      where: {
        companyId_deduplicationKey: {
          companyId: params.companyId,
          deduplicationKey: params.deduplicationKey,
        },
      },
    })
    if (raced) return raced
    throw error
  }
}

export type ConfirmationSmsOutboxPayload = {
  taskId: string
  /** Template identity; body is regenerated at send time to avoid template drift. */
  template: "confirmation_v1"
  recipientPhoneE164?: string
}

/**
 * Prefer identifiers + template version over rendered body text.
 * Confirmation SMS copy can change; regenerating from current templates
 * at send time is safer than storing a stale rendered string.
 */
export function buildConfirmationSmsDedupKey(params: {
  taskId: string
  scheduleVersion: number | string
}): string {
  return `confirmation:${params.taskId}:v${params.scheduleVersion}`
}
