import type { OutboxMessage, PrismaClient } from "@prisma/client"
import {
  classifyOutboxError,
  computeOutboxRetryDelayMs,
} from "@/lib/server-transactions/retry"
import { OUTBOX_TYPES, SERVER_TX_POLICY } from "@/lib/server-transactions/types"

export type OutboxSendResult = {
  providerReference?: string
}

export type OutboxAdapter = (
  message: OutboxMessage
) => Promise<OutboxSendResult>

export type ProcessOutboxOptions = {
  prisma: PrismaClient
  workerId?: string
  limit?: number
  adapters?: Partial<Record<string, OutboxAdapter>>
  now?: () => Date
}

export type ProcessOutboxResult = {
  claimed: number
  succeeded: number
  retried: number
  failed: number
  skipped: number
}

function createAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `oa-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function defaultNoOpAdapter(message: OutboxMessage): Promise<OutboxSendResult> {
  return Promise.resolve({
    providerReference: `noop:${message.id}`,
  })
}

/**
 * Claim and process eligible outbox rows.
 * Safe to invoke repeatedly (Vercel Cron / internal route).
 *
 * Ambiguous provider timeouts: if the adapter throws after the provider may have
 * accepted the message, we retry. DeduplicationKey + providerReference persistence
 * aim for effectively-once application behavior, not provider exactly-once.
 */
export async function processOutboxBatch(
  options: ProcessOutboxOptions
): Promise<ProcessOutboxResult> {
  const prisma = options.prisma
  const workerId = options.workerId ?? `worker-${createAttemptId()}`
  const limit = options.limit ?? 20
  const now = options.now?.() ?? new Date()
  const result: ProcessOutboxResult = {
    claimed: 0,
    succeeded: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
  }

  await recoverStaleProcessing(prisma, now)

  const eligible = await prisma.outboxMessage.findMany({
    where: {
      status: { in: ["pending", "retrying"] },
      nextAttemptAt: { lte: now },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  })

  for (const candidate of eligible) {
    const attemptId = createAttemptId()
    const claimed = await claimOutboxRow(prisma, candidate.id, workerId, attemptId, now)
    if (!claimed) {
      result.skipped++
      continue
    }
    result.claimed++

    const adapter =
      options.adapters?.[claimed.type] ??
      (claimed.type === OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT
        ? defaultNoOpAdapter
        : options.adapters?.[claimed.type])

    if (!adapter) {
      await completeWithOwnership(prisma, claimed, attemptId, {
        status: "permanently_failed",
        lastErrorCode: "NO_ADAPTER",
        lastErrorMessage: `No adapter registered for outbox type ${claimed.type}`,
      })
      result.failed++
      continue
    }

    try {
      const sendResult = await adapter(claimed)
      const updated = await completeWithOwnership(prisma, claimed, attemptId, {
        status: "succeeded",
        providerReference: sendResult.providerReference ?? claimed.providerReference,
        sentAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        lockedAt: null,
        lockedBy: null,
        processingAttemptId: null,
      })
      if (updated) result.succeeded++
      else result.skipped++
    } catch (error) {
      const classified = classifyOutboxError(error)
      const attempts = claimed.attempts + 1

      if (
        classified.kind === "configuration" ||
        classified.kind === "permanent" ||
        attempts >= claimed.maxAttempts
      ) {
        const updated = await completeWithOwnership(prisma, claimed, attemptId, {
          status: "permanently_failed",
          attempts,
          lastErrorCode: classified.code,
          lastErrorMessage: classified.message,
          lockedAt: null,
          lockedBy: null,
          processingAttemptId: null,
        })
        if (updated) result.failed++
        else result.skipped++
        continue
      }

      const delay = computeOutboxRetryDelayMs(attempts, classified.retryAfterMs)
      const updated = await completeWithOwnership(prisma, claimed, attemptId, {
        status: "retrying",
        attempts,
        nextAttemptAt: new Date(now.getTime() + delay),
        lastErrorCode: classified.code,
        lastErrorMessage: classified.message,
        lockedAt: null,
        lockedBy: null,
        processingAttemptId: null,
      })
      if (updated) result.retried++
      else result.skipped++
    }
  }

  return result
}

async function recoverStaleProcessing(prisma: PrismaClient, now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - SERVER_TX_POLICY.staleProcessingMs)
  await prisma.outboxMessage.updateMany({
    where: {
      status: "processing",
      lockedAt: { lt: staleBefore },
    },
    data: {
      status: "retrying",
      nextAttemptAt: now,
      lockedAt: null,
      lockedBy: null,
      processingAttemptId: null,
      lastErrorCode: "STALE_LOCK",
      lastErrorMessage: "Recovered stale outbox processing lock",
    },
  })
}

async function claimOutboxRow(
  prisma: PrismaClient,
  id: string,
  workerId: string,
  attemptId: string,
  now: Date
): Promise<OutboxMessage | null> {
  const updated = await prisma.outboxMessage.updateMany({
    where: {
      id,
      status: { in: ["pending", "retrying"] },
      nextAttemptAt: { lte: now },
    },
    data: {
      status: "processing",
      lockedAt: now,
      lockedBy: workerId,
      processingAttemptId: attemptId,
    },
  })
  if (updated.count === 0) return null
  return prisma.outboxMessage.findUnique({ where: { id } })
}

async function completeWithOwnership(
  prisma: PrismaClient,
  message: OutboxMessage,
  attemptId: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const updated = await prisma.outboxMessage.updateMany({
    where: {
      id: message.id,
      status: "processing",
      processingAttemptId: attemptId,
    },
    data: data as never,
  })
  return updated.count === 1
}
