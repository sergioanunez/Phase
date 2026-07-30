/**
 * Typed mutation outcomes for executeIdempotentMutation.
 * Prefer throwing these (or returning typed envelopes) over bare Error.
 */

import type { TransactionConflictPayload } from "@/lib/server-transactions/types"
import { VersionConflictError } from "@/lib/server-transactions/versioning"

export { VersionConflictError }

/** Permanent domain/business rejection — persisted as rejected, same-key replay. */
export class PermanentRejectionError extends Error {
  readonly kind = "permanent" as const
  readonly code: string
  readonly userMessage: string
  readonly httpHint?: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION"

  constructor(params: {
    code: string
    /** Safe message for clients (no internal/Prisma details). */
    message: string
    httpHint?: PermanentRejectionError["httpHint"]
  }) {
    super(params.message)
    this.name = "PermanentRejectionError"
    this.code = params.code
    this.userMessage = params.message
    this.httpHint = params.httpHint
  }
}

/** Transient infrastructure failure — TX rolls back; same key may retry. */
export class RetryableMutationError extends Error {
  readonly kind = "retryable" as const
  readonly code: string
  readonly userMessage: string

  constructor(params: { code?: string; message?: string } = {}) {
    const message = params.message ?? "Temporary server error. Please retry."
    super(message)
    this.name = "RetryableMutationError"
    this.code = params.code ?? "RETRYABLE_FAILURE"
    this.userMessage = message
  }
}

/**
 * Outcome cannot be proven. Persisted as uncertain; never auto-re-execute.
 * Use when a write may have escaped the transaction or an external side effect ran.
 */
export class UncertainOutcomeError extends Error {
  readonly kind = "uncertain" as const
  readonly code: string
  readonly userMessage: string

  constructor(params: { code?: string; message?: string } = {}) {
    const message =
      params.message ??
      "This change may already have been applied. Do not retry automatically."
    super(message)
    this.name = "UncertainOutcomeError"
    this.code = params.code ?? "UNCERTAIN_OUTCOME"
    this.userMessage = message
  }
}

export type MutationErrorKind = "permanent" | "retryable" | "uncertain" | "conflict"

export function isPermanentRejectionError(error: unknown): error is PermanentRejectionError {
  return error instanceof PermanentRejectionError
}

export function isRetryableMutationError(error: unknown): error is RetryableMutationError {
  return error instanceof RetryableMutationError
}

export function isUncertainOutcomeError(error: unknown): error is UncertainOutcomeError {
  return error instanceof UncertainOutcomeError
}

export function isVersionConflictError(error: unknown): error is VersionConflictError {
  return error instanceof VersionConflictError
}

/** Prisma / driver codes that are safe to treat as retryable when thrown inside a TX. */
const RETRYABLE_PRISMA_CODES = new Set([
  "P1001", // can't reach DB
  "P1002", // timed out
  "P1008", // operations timed out
  "P1017", // server closed connection
  "P2024", // pool timeout
  "P2034", // write conflict / deadlock retry
])

/**
 * Classify an unknown throw from inside the mutation TX.
 * Defaults to retryable (TX will roll back domain+claim) unless clearly permanent/uncertain.
 */
export function classifyExecuteError(error: unknown): {
  kind: MutationErrorKind
  code: string
  userMessage: string
  conflict?: TransactionConflictPayload
  httpHint?: PermanentRejectionError["httpHint"]
} {
  if (isVersionConflictError(error)) {
    return {
      kind: "conflict",
      code: "VERSION_CONFLICT",
      userMessage: error.conflict.message,
      conflict: error.conflict,
    }
  }
  if (isPermanentRejectionError(error)) {
    return {
      kind: "permanent",
      code: error.code,
      userMessage: error.userMessage,
      httpHint: error.httpHint,
    }
  }
  if (isRetryableMutationError(error)) {
    return {
      kind: "retryable",
      code: error.code,
      userMessage: error.userMessage,
    }
  }
  if (isUncertainOutcomeError(error)) {
    return {
      kind: "uncertain",
      code: error.code,
      userMessage: error.userMessage,
    }
  }

  const anyErr = error as { code?: string; message?: string }
  if (typeof anyErr?.code === "string" && RETRYABLE_PRISMA_CODES.has(anyErr.code)) {
    return {
      kind: "retryable",
      code: "DATABASE_TRANSIENT",
      userMessage: "Temporary database error. Please retry.",
    }
  }

  // Deadlock / serialization messages without Prisma code
  if (
    typeof anyErr?.message === "string" &&
    /deadlock|serialization failure|could not serialize/i.test(anyErr.message)
  ) {
    return {
      kind: "retryable",
      code: "DATABASE_CONFLICT",
      userMessage: "Temporary database conflict. Please retry.",
    }
  }

  // Default: TX rolls back, so retrying the same key is safe for tx-scoped writes.
  return {
    kind: "retryable",
    code: "RETRYABLE_FAILURE",
    userMessage: "Temporary server error. Please retry.",
  }
}
