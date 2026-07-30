import { createId } from "@paralleldrive/cuid2"
import type { Prisma, PrismaClient, ProcessedMutation } from "@prisma/client"
import { classifyExecuteError } from "@/lib/server-transactions/errors"
import {
  assertResponseDataSize,
  hashResponseData,
  isValidIdempotencyKey,
  parseStoredEnvelope,
  SERVER_TX_POLICY,
  type ConflictEnvelope,
  type RejectedEnvelope,
  type TransactionEnvelope,
  type UncertainEnvelope,
} from "@/lib/server-transactions/types"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Context passed to domain execute callbacks.
 * ALL domain writes, activity writes, and outbox inserts for this mutation
 * MUST use `context.tx` — never the global Prisma client.
 */
export type IdempotentMutationContext = {
  tx: Prisma.TransactionClient
  companyId: string
  actorUserId?: string | null
  idempotencyKey: string
  mutationId: string
}

export type IdempotentExecuteParams<TEntity> = {
  prisma: PrismaClient
  companyId: string
  actorUserId?: string | null
  idempotencyKey: string
  mutationType: string
  entityType?: string
  entityId?: string
  /**
   * Domain work. Use only `context.tx` for authoritative writes so claim,
   * mutation, outbox, and response persist commit (or roll back) together.
   */
  execute: (
    context: IdempotentMutationContext
  ) => Promise<TransactionEnvelope<TEntity>>
}

function inProgressEnvelope(
  row: ProcessedMutation
): TransactionEnvelope {
  return {
    status: "in_progress",
    mutationId: row.id,
    idempotencyKey: row.idempotencyKey,
    entityType: row.entityType ?? undefined,
    entityId: row.entityId ?? undefined,
    error: {
      code: "IN_PROGRESS",
      message: "This mutation is already being processed",
      retryable: true,
    },
  }
}

function uncertainEnvelope(
  row: ProcessedMutation,
  code: string,
  message: string
): UncertainEnvelope {
  return {
    status: "uncertain",
    mutationId: row.id,
    idempotencyKey: row.idempotencyKey,
    entityType: row.entityType ?? undefined,
    entityId: row.entityId ?? undefined,
    error: {
      code,
      message,
      retryable: false,
    },
  }
}

function corruptedReplayEnvelope(row: ProcessedMutation): UncertainEnvelope {
  return uncertainEnvelope(
    row,
    "CORRUPTED_RESPONSE_DATA",
    "Stored mutation result is invalid. Do not retry automatically."
  )
}

/**
 * Replay a terminal ProcessedMutation row.
 * Never re-executes. Validates responseData before returning.
 */
function replayTerminal<TEntity>(
  row: ProcessedMutation
): TransactionEnvelope<TEntity> {
  if (row.status === "uncertain") {
    const stored = parseStoredEnvelope<TEntity>(
      row.responseData,
      row.idempotencyKey,
      row.id
    )
    if (stored?.status === "uncertain") return stored
    return uncertainEnvelope(
      row,
      row.errorCode ?? "UNCERTAIN_OUTCOME",
      "This change may already have been applied. Do not retry automatically."
    )
  }

  if (row.status === "rejected" || row.status === "succeeded") {
    const stored = parseStoredEnvelope<TEntity>(
      row.responseData,
      row.idempotencyKey,
      row.id
    )
    if (!stored) {
      if (row.status === "rejected") {
        return {
          status: "rejected",
          mutationId: row.id,
          idempotencyKey: row.idempotencyKey,
          error: {
            code: row.errorCode ?? "PREVIOUSLY_REJECTED",
            message: "Previous attempt was rejected",
            retryable: false,
          },
        }
      }
      return corruptedReplayEnvelope(row)
    }
    return { ...stored, mutationId: row.id, idempotencyKey: row.idempotencyKey }
  }

  // Legacy / unexpected
  return corruptedReplayEnvelope(row)
}

async function markStaleProcessingUncertain(
  prisma: PrismaClient,
  row: ProcessedMutation
): Promise<TransactionEnvelope> {
  const envelope = uncertainEnvelope(
    row,
    "STALE_PROCESSING",
    "This mutation was interrupted and cannot be verified. Do not retry automatically."
  )
  await prisma.processedMutation.updateMany({
    where: {
      id: row.id,
      status: "processing",
    },
    data: {
      status: "uncertain",
      responseData: envelope as unknown as Prisma.InputJsonValue,
      responseHash: hashResponseData(envelope),
      errorCode: "STALE_PROCESSING",
      errorMessage: envelope.error.message,
      completedAt: new Date(),
    },
  })
  return envelope
}

/**
 * Resolve an existing row for same-key policy.
 * Returns a terminal envelope, or null when the key may be (re)claimed.
 *
 * Invariant: claim + finalize share one DB transaction, so a committed
 * `processing` row is abnormal (manual intervention / legacy / future bug).
 * Stale committed processing → uncertain (never silent re-execute).
 */
async function resolveExistingRow<TEntity>(
  prisma: PrismaClient,
  row: ProcessedMutation,
  now: Date
): Promise<TransactionEnvelope<TEntity> | null> {
  if (row.status === "retryable_failed") {
    // Same key may reclaim and execute again.
    return null
  }

  if (row.status === "processing") {
    const ageMs = now.getTime() - row.updatedAt.getTime()
    if (ageMs >= SERVER_TX_POLICY.staleProcessedMutationMs) {
      return (await markStaleProcessingUncertain(prisma, row)) as TransactionEnvelope<TEntity>
    }
    return inProgressEnvelope(row) as TransactionEnvelope<TEntity>
  }

  return replayTerminal<TEntity>(row)
}

async function persistTerminal(
  tx: Prisma.TransactionClient,
  mutationId: string,
  status: "succeeded" | "rejected" | "uncertain",
  envelope: TransactionEnvelope,
  errorCode?: string | null,
  errorMessage?: string | null
) {
  assertResponseDataSize(envelope)
  await tx.processedMutation.update({
    where: { id: mutationId },
    data: {
      status,
      responseData: envelope as unknown as Prisma.InputJsonValue,
      responseHash: hashResponseData(envelope),
      entityType: envelope.entityType ?? null,
      entityId: envelope.entityId ?? null,
      completedAt: new Date(),
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
    },
  })
}

/**
 * Claim an idempotency key and execute at most once per successful/rejected outcome.
 *
 * Same-key policy:
 * - succeeded / rejected / uncertain → replay stored envelope (no re-execute)
 * - retryable_failed → reclaim and execute again
 * - processing (fresh) → in_progress
 * - processing (stale committed) → mark uncertain
 *
 * Retryable failures inside the interactive transaction abort the TX so the
 * claim rolls back; the key stays free for the same idempotency key. The
 * `retryable_failed` status exists for defensive/manual rows and reclaim.
 */
export async function executeIdempotentMutation<TEntity = unknown>(
  params: IdempotentExecuteParams<TEntity>
): Promise<TransactionEnvelope<TEntity>> {
  const key = params.idempotencyKey.trim()
  if (!isValidIdempotencyKey(key)) {
    return {
      status: "rejected",
      idempotencyKey: key,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "Idempotency key must be 8–128 URL-safe characters",
        retryable: false,
      },
    }
  }

  const now = new Date()
  const existing = await params.prisma.processedMutation.findUnique({
    where: {
      companyId_idempotencyKey: {
        companyId: params.companyId,
        idempotencyKey: key,
      },
    },
  })
  if (existing) {
    const resolved = await resolveExistingRow<TEntity>(params.prisma, existing, now)
    if (resolved) return resolved
  }

  try {
    return await params.prisma.$transaction(async (tx) => {
      // Reclaim retryable_failed, else insert claim.
      const reclaimed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "ProcessedMutation"
        SET
          "status" = 'processing'::"ProcessedMutationStatus",
          "actorUserId" = ${params.actorUserId ?? null},
          "mutationType" = ${params.mutationType},
          "entityType" = ${params.entityType ?? null},
          "entityId" = ${params.entityId ?? null},
          "responseData" = NULL,
          "responseHash" = NULL,
          "errorCode" = NULL,
          "errorMessage" = NULL,
          "completedAt" = NULL,
          "updatedAt" = NOW()
        WHERE "companyId" = ${params.companyId}
          AND "idempotencyKey" = ${key}
          AND "status" = 'retryable_failed'::"ProcessedMutationStatus"
        RETURNING "id"
      `

      let mutationId: string | null = reclaimed[0]?.id ?? null

      if (!mutationId) {
        const claimRows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO "ProcessedMutation" (
            "id", "companyId", "actorUserId", "idempotencyKey", "mutationType",
            "entityType", "entityId", "status", "createdAt", "updatedAt"
          )
          VALUES (
            ${createId()}, ${params.companyId}, ${params.actorUserId ?? null}, ${key},
            ${params.mutationType}, ${params.entityType ?? null}, ${params.entityId ?? null},
            'processing'::"ProcessedMutationStatus", NOW(), NOW()
          )
          ON CONFLICT ("companyId", "idempotencyKey") DO NOTHING
          RETURNING "id"
        `
        mutationId = claimRows[0]?.id ?? null
      }

      if (!mutationId) {
        const raced = await tx.processedMutation.findUnique({
          where: {
            companyId_idempotencyKey: {
              companyId: params.companyId,
              idempotencyKey: key,
            },
          },
        })
        if (!raced) {
          return {
            status: "rejected" as const,
            idempotencyKey: key,
            error: {
              code: "CLAIM_RACE",
              message: "Could not claim idempotency key. Please retry.",
              retryable: true,
            },
          }
        }
        if (raced.status === "processing") {
          return inProgressEnvelope(raced) as TransactionEnvelope<TEntity>
        }
        if (raced.status === "retryable_failed") {
          // Lost reclaim race; ask client to retry same key.
          return {
            status: "rejected" as const,
            idempotencyKey: key,
            mutationId: raced.id,
            error: {
              code: "CLAIM_RACE",
              message: "Could not claim idempotency key. Please retry.",
              retryable: true,
            },
          }
        }
        return replayTerminal<TEntity>(raced)
      }

      try {
        if (
          process.env.NODE_ENV !== "production" &&
          process.env.SERVER_TX_ASSERT_TX === "1"
        ) {
          // Dev-only marker so handlers can assert they received a TX client.
          Object.defineProperty(tx, "__phaseIdempotentTx", {
            value: true,
            enumerable: false,
          })
        }

        const envelope = await params.execute({
          tx,
          companyId: params.companyId,
          actorUserId: params.actorUserId,
          idempotencyKey: key,
          mutationId,
        })

        if (
          envelope.status !== "applied" &&
          envelope.status !== "noop" &&
          envelope.status !== "conflict"
        ) {
          // Handlers returning rejected/uncertain envelopes persist those statuses.
          if (envelope.status === "rejected") {
            const finalized: RejectedEnvelope = {
              ...envelope,
              mutationId,
              idempotencyKey: key,
              error: {
                ...envelope.error,
                retryable: false,
              },
            }
            await persistTerminal(
              tx,
              mutationId,
              "rejected",
              finalized,
              finalized.error.code,
              finalized.error.message
            )
            return finalized as TransactionEnvelope<TEntity>
          }
          if (envelope.status === "uncertain") {
            const finalized: UncertainEnvelope = {
              ...envelope,
              mutationId,
              idempotencyKey: key,
              error: { ...envelope.error, retryable: false },
            }
            await persistTerminal(
              tx,
              mutationId,
              "uncertain",
              finalized,
              finalized.error.code,
              finalized.error.message
            )
            return finalized
          }
        }

        const finalized: TransactionEnvelope<TEntity> = {
          ...envelope,
          mutationId,
          idempotencyKey: key,
        }
        await persistTerminal(tx, mutationId, "succeeded", finalized)
        return finalized
      } catch (error) {
        const classified = classifyExecuteError(error)

        if (classified.kind === "conflict" && classified.conflict) {
          const conflictEnvelope: ConflictEnvelope = {
            status: "conflict",
            mutationId,
            idempotencyKey: key,
            conflict: classified.conflict,
          }
          await persistTerminal(tx, mutationId, "succeeded", conflictEnvelope)
          return conflictEnvelope
        }

        if (classified.kind === "permanent") {
          const rejected: RejectedEnvelope = {
            status: "rejected",
            mutationId,
            idempotencyKey: key,
            error: {
              code: classified.code,
              message: classified.userMessage,
              retryable: false,
            },
          }
          await persistTerminal(
            tx,
            mutationId,
            "rejected",
            rejected,
            classified.code,
            classified.userMessage
          )
          return rejected
        }

        if (classified.kind === "uncertain") {
          const uncertain: UncertainEnvelope = {
            status: "uncertain",
            mutationId,
            idempotencyKey: key,
            error: {
              code: classified.code,
              message: classified.userMessage,
              retryable: false,
            },
          }
          await persistTerminal(
            tx,
            mutationId,
            "uncertain",
            uncertain,
            classified.code,
            classified.userMessage
          )
          return uncertain
        }

        // Retryable: abort TX so claim + domain roll back; same key stays free.
        const retryable = new Error("RETRYABLE_MUTATION_ABORT") as Error & {
          __phaseRetryable?: RejectedEnvelope
        }
        retryable.__phaseRetryable = {
          status: "rejected",
          idempotencyKey: key,
          error: {
            code: classified.code,
            message: classified.userMessage,
            retryable: true,
          },
        }
        throw retryable
      }
    })
  } catch (error) {
    const retryEnvelope = (error as { __phaseRetryable?: RejectedEnvelope })
      ?.__phaseRetryable
    if (retryEnvelope) {
      return retryEnvelope as TransactionEnvelope<TEntity>
    }

    const again = await params.prisma.processedMutation.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: params.companyId,
          idempotencyKey: key,
        },
      },
    })
    if (again) {
      const resolved = await resolveExistingRow<TEntity>(params.prisma, again, new Date())
      if (resolved) return resolved
    }

    // TX aborted without durable row — same key may retry.
    const classified = classifyExecuteError(error)
    return {
      status: "rejected",
      idempotencyKey: key,
      error: {
        code: classified.code,
        message: classified.userMessage,
        retryable: classified.kind === "retryable",
      },
    }
  }
}

/** Test helper: load a ProcessedMutation by company + key. */
export async function findProcessedMutation(
  prisma: DbClient,
  companyId: string,
  idempotencyKey: string
) {
  return prisma.processedMutation.findUnique({
    where: {
      companyId_idempotencyKey: { companyId, idempotencyKey },
    },
  })
}
