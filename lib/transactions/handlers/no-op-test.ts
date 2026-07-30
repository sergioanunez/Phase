import { TransactionExecutionError } from "@/lib/transactions/retry"
import type {
  ConflictResolveResult,
  TransactionHandler,
  TransactionPayloadMap,
} from "@/lib/transactions/types"

export const noOpTestTransactionHandler: TransactionHandler<"NO_OP_TEST"> = {
  type: "NO_OP_TEST",

  validate(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("NO_OP_TEST requires an object payload")
    }
    validateNonNegativeInteger(payload.failAttempts, "failAttempts")
    validateNonNegativeInteger(payload.delayMs, "delayMs")
    validateNonNegativeInteger(payload.executionTimeoutMs, "executionTimeoutMs")
    validateNonNegativeInteger(payload.maxAutomaticRetries, "maxAutomaticRetries")
  },

  executionTimeoutMs(transaction) {
    const payload = transaction.payload as TransactionPayloadMap["NO_OP_TEST"]
    return payload.executionTimeoutMs ?? 30_000
  },

  maxAutomaticRetries(transaction) {
    const payload = transaction.payload as TransactionPayloadMap["NO_OP_TEST"]
    return payload.maxAutomaticRetries ?? 8
  },

  async execute({ transaction, signal }) {
    const payload = transaction.payload as TransactionPayloadMap["NO_OP_TEST"]

    if (payload.hangForever) {
      await new Promise<never>((_resolve, reject) => {
        const onAbort = () => {
          reject(
            new TransactionExecutionError({
              kind: "retriable",
              code: "TIMEOUT",
              message: "Transaction execution timed out",
            })
          )
        }
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener("abort", onAbort, { once: true })
      })
    }

    if (payload.delayMs) {
      await delay(payload.delayMs, signal)
    }

    if (transaction.retryCount < (payload.failAttempts ?? 0)) {
      if (payload.failureKind === "validation") {
        throw new TransactionExecutionError({
          kind: "permanent",
          code: "NO_OP_VALIDATION",
          message: "Intentional permanent test failure",
        })
      }
      if (payload.failureKind === "conflict") {
        throw new TransactionExecutionError({
          kind: "conflict",
          code: "NO_OP_CONFLICT",
          message: "Intentional test conflict",
          conflictMetadata: { serverValue: "server", localValue: payload.value ?? null },
        })
      }
      if (payload.failureKind === "auth") {
        throw new TransactionExecutionError({
          kind: "authentication",
          code: "HTTP_401",
          message: "Authentication required",
        })
      }
      throw new TransactionExecutionError({
        kind: "retriable",
        code: payload.failureKind === "server" ? "HTTP_503" : "NETWORK_ERROR",
        message: "Intentional retriable test failure",
        retryAfterMs: 1,
      })
    }

    return {
      status: "applied",
      resultMetadata: {
        handler: "NO_OP_TEST",
        reconciledValue: payload.value ?? null,
        attempt: transaction.retryCount + 1,
      },
    }
  },

  async resolveConflict({ transaction, intent }): Promise<ConflictResolveResult> {
    const payload = transaction.payload as TransactionPayloadMap["NO_OP_TEST"]
    if (intent === "keep_server") {
      return {
        action: "resolved_noop",
        resultMetadata: { kept: "server", localValue: payload.value ?? null },
      }
    }
    if (intent === "discard_local") {
      return { action: "discard", resultMetadata: { discarded: true } }
    }
    return {
      action: "rebase",
      payload: {
        ...payload,
        value: payload.value ?? "rebased",
        failAttempts: 0,
      },
      baseVersion: (transaction.baseVersion ?? 0) + 1,
      resultMetadata: { rebased: true },
    }
  },
}

function validateNonNegativeInteger(value: number | undefined, field: string): void {
  if (value == null) return
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(
        new TransactionExecutionError({
          kind: "retriable",
          code: "TIMEOUT",
          message: "Transaction execution timed out",
        })
      )
      return
    }
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(
          new TransactionExecutionError({
            kind: "retriable",
            code: "TIMEOUT",
            message: "Transaction execution timed out",
          })
        )
      },
      { once: true }
    )
  })
}
