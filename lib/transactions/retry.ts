import type {
  ClassifiedTransactionError,
  TransactionErrorKind,
} from "@/lib/transactions/types"
import { TRANSACTION_POLICY } from "@/lib/transactions/types"

const RETRIABLE_HTTP_STATUSES = new Set([429, 502, 503, 504])
const AUTH_HTTP_STATUSES = new Set([401])
const CONFLICT_HTTP_STATUSES = new Set([409])

export class TransactionExecutionError extends Error {
  readonly kind: TransactionErrorKind
  readonly code: string
  readonly retryAfterMs?: number
  readonly conflictMetadata?: ClassifiedTransactionError["conflictMetadata"]

  constructor(params: {
    kind: TransactionErrorKind
    code: string
    message: string
    retryAfterMs?: number
    conflictMetadata?: ClassifiedTransactionError["conflictMetadata"]
  }) {
    super(params.message)
    this.name = "TransactionExecutionError"
    this.kind = params.kind
    this.code = params.code
    this.retryAfterMs = params.retryAfterMs
    this.conflictMetadata = params.conflictMetadata
  }
}

export function classifyTransactionError(error: unknown): ClassifiedTransactionError {
  if (error instanceof TransactionExecutionError) {
    return {
      kind: error.kind,
      code: error.code,
      message: error.message,
      retryAfterMs: error.retryAfterMs,
      conflictMetadata: error.conflictMetadata,
    }
  }

  if (error instanceof Response) {
    const status = error.status
    if (AUTH_HTTP_STATUSES.has(status)) {
      return { kind: "authentication", code: `HTTP_${status}`, message: "Authentication required" }
    }
    if (CONFLICT_HTTP_STATUSES.has(status)) {
      return { kind: "conflict", code: `HTTP_${status}`, message: "Server state changed" }
    }
    if (RETRIABLE_HTTP_STATUSES.has(status)) {
      return {
        kind: "retriable",
        code: `HTTP_${status}`,
        message: "Temporary server failure",
        retryAfterMs: parseRetryAfter(error.headers.get("Retry-After")),
      }
    }
    return { kind: "permanent", code: `HTTP_${status}`, message: "Request was rejected" }
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      kind: "retriable",
      code: "TIMEOUT",
      message: "Transaction execution timed out",
    }
  }

  if (error instanceof TypeError) {
    return { kind: "retriable", code: "NETWORK_ERROR", message: "Network request failed" }
  }

  return {
    kind: "permanent",
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "Unknown transaction failure",
  }
}

export function computeRetryDelayMs(
  retryCount: number,
  retryAfterMs?: number,
  random: () => number = Math.random
): number {
  if (retryAfterMs != null && Number.isFinite(retryAfterMs)) {
    return Math.max(0, Math.min(retryAfterMs, 5 * 60_000))
  }
  const exponent = Math.max(0, retryCount - 1)
  const base = Math.min(3_000 * 2 ** exponent, 5 * 60_000)
  const jitter = 0.8 + random() * 0.4
  return Math.round(base * jitter)
}

export function resolveMaxAutomaticRetries(override?: number): number {
  if (override != null && Number.isInteger(override) && override >= 0) return override
  return TRANSACTION_POLICY.maxAutomaticRetries
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}
