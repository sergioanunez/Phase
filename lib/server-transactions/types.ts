import { createHash } from "crypto"
import type { Prisma } from "@prisma/client"

export type TransactionConflictPayload = {
  code: string
  message: string
  serverValue?: unknown
  baseVersion?: number
  serverVersion?: number
}

export type TransactionErrorPayload = {
  code: string
  /** User-safe message only — never raw Prisma/Twilio internals. */
  message: string
  retryable: boolean
}

export type TransactionSideEffectRef = {
  type: string
  status: string
  referenceId?: string
}

type EnvelopeBase = {
  mutationId?: string
  idempotencyKey: string
  entityType?: string
  entityId?: string
}

export type AppliedEnvelope<TEntity = unknown> = EnvelopeBase & {
  status: "applied"
  entity?: TEntity
  version?: number
  sideEffects?: TransactionSideEffectRef[]
}

export type NoopEnvelope = EnvelopeBase & {
  status: "noop"
  entity?: unknown
  version?: number
  sideEffects?: TransactionSideEffectRef[]
}

export type ConflictEnvelope = EnvelopeBase & {
  status: "conflict"
  conflict: TransactionConflictPayload
  version?: number
}

export type RejectedEnvelope = EnvelopeBase & {
  status: "rejected"
  error: TransactionErrorPayload
}

export type InProgressEnvelope = EnvelopeBase & {
  status: "in_progress"
  error: TransactionErrorPayload & { retryable: true }
}

export type UncertainEnvelope = EnvelopeBase & {
  status: "uncertain"
  error: TransactionErrorPayload & { retryable: false }
}

/**
 * Canonical Transaction Engine response envelope (discriminated on `status`).
 *
 * HTTP mapping:
 * - applied / noop → 200
 * - in_progress → 202
 * - conflict → 409
 * - rejected (retryable: true) → 503
 * - rejected (UNAUTHORIZED) → 401
 * - rejected (FORBIDDEN) → 403
 * - rejected (NOT_FOUND) → 404
 * - other rejected → 400
 * - uncertain → 409 (or 500-class conflict: do not auto-retry)
 */
export type TransactionEnvelope<TEntity = unknown> =
  | AppliedEnvelope<TEntity>
  | NoopEnvelope
  | ConflictEnvelope
  | RejectedEnvelope
  | InProgressEnvelope
  | UncertainEnvelope

export type TransactionEnvelopeStatus = TransactionEnvelope["status"]

export const OUTBOX_TYPES = {
  SEND_CONFIRMATION_SMS: "SEND_CONFIRMATION_SMS",
  /** Dev/test-only side effect for proving the outbox processor. */
  NO_OP_TEST_SIDE_EFFECT: "NO_OP_TEST_SIDE_EFFECT",
} as const

export type OutboxType = (typeof OUTBOX_TYPES)[keyof typeof OUTBOX_TYPES]

export const SERVER_TX_POLICY = {
  maxOutboxAttempts: 8,
  staleProcessingMs: 90_000,
  /** Committed processing rows older than this become uncertain (defensive). */
  staleProcessedMutationMs: 120_000,
  processingInProgressRetryAfterMs: 1_000,
  /** Max JSON size for responseData (bytes of UTF-8 JSON). */
  maxResponseDataBytes: 16_384,
} as const

export function hashResponseData(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data ?? null)).digest("hex")
}

export function isValidIdempotencyKey(key: string): boolean {
  return typeof key === "string" && /^[A-Za-z0-9_.:-]{8,128}$/.test(key.trim())
}

export function envelopeHttpStatus(envelope: TransactionEnvelope): number {
  switch (envelope.status) {
    case "applied":
    case "noop":
      return 200
    case "in_progress":
      return 202
    case "conflict":
      return 409
    case "uncertain":
      return 409
    case "rejected":
      if (envelope.error.retryable) return 503
      if (envelope.error.code === "UNAUTHORIZED") return 401
      if (envelope.error.code === "FORBIDDEN") return 403
      if (envelope.error.code === "NOT_FOUND") return 404
      return 400
    default:
      return 500
  }
}

export type JsonObject = Prisma.InputJsonValue

const ENVELOPE_STATUSES = new Set([
  "applied",
  "noop",
  "conflict",
  "rejected",
  "in_progress",
  "uncertain",
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Schema-validate stored responseData before replay.
 * Returns null when corrupted / impossible combinations are detected.
 */
export function parseStoredEnvelope<TEntity = unknown>(
  raw: unknown,
  idempotencyKey: string,
  mutationId?: string
): TransactionEnvelope<TEntity> | null {
  if (!isPlainObject(raw)) return null
  const status = raw.status
  if (typeof status !== "string" || !ENVELOPE_STATUSES.has(status)) return null
  if (typeof raw.idempotencyKey !== "string" && raw.idempotencyKey != null) return null

  const base = {
    mutationId: mutationId ?? (typeof raw.mutationId === "string" ? raw.mutationId : undefined),
    idempotencyKey:
      typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : idempotencyKey,
    entityType: typeof raw.entityType === "string" ? raw.entityType : undefined,
    entityId: typeof raw.entityId === "string" ? raw.entityId : undefined,
  }

  switch (status) {
    case "applied":
    case "noop":
      return {
        ...base,
        status,
        entity: raw.entity as TEntity | undefined,
        version: typeof raw.version === "number" ? raw.version : undefined,
        sideEffects: Array.isArray(raw.sideEffects)
          ? (raw.sideEffects as TransactionSideEffectRef[])
          : undefined,
      }
    case "conflict": {
      if (!isPlainObject(raw.conflict) || typeof raw.conflict.code !== "string") return null
      if (typeof raw.conflict.message !== "string") return null
      return {
        ...base,
        status: "conflict",
        conflict: {
          code: raw.conflict.code,
          message: raw.conflict.message,
          serverValue: raw.conflict.serverValue,
          baseVersion:
            typeof raw.conflict.baseVersion === "number"
              ? raw.conflict.baseVersion
              : undefined,
          serverVersion:
            typeof raw.conflict.serverVersion === "number"
              ? raw.conflict.serverVersion
              : undefined,
        },
        version: typeof raw.version === "number" ? raw.version : undefined,
      }
    }
    case "rejected": {
      if (!isPlainObject(raw.error) || typeof raw.error.code !== "string") return null
      if (typeof raw.error.message !== "string") return null
      return {
        ...base,
        status: "rejected",
        error: {
          code: raw.error.code,
          message: raw.error.message,
          retryable: Boolean(raw.error.retryable),
        },
      }
    }
    case "in_progress": {
      return {
        ...base,
        status: "in_progress",
        error: {
          code: "IN_PROGRESS",
          message: "This mutation is already being processed",
          retryable: true,
        },
      }
    }
    case "uncertain": {
      if (!isPlainObject(raw.error) || typeof raw.error.code !== "string") return null
      if (typeof raw.error.message !== "string") return null
      return {
        ...base,
        status: "uncertain",
        error: {
          code: raw.error.code,
          message: raw.error.message,
          retryable: false,
        },
      }
    }
    default:
      return null
  }
}

export function assertResponseDataSize(data: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(data ?? null), "utf8")
  if (bytes > SERVER_TX_POLICY.maxResponseDataBytes) {
    throw new Error("RESPONSE_DATA_TOO_LARGE")
  }
}
