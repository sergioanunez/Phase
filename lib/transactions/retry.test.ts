import { describe, expect, it } from "vitest"
import {
  TransactionExecutionError,
  classifyTransactionError,
  computeRetryDelayMs,
} from "@/lib/transactions/internal/test-utils"
import { TRANSACTION_POLICY } from "@/lib/transactions"

describe("transaction retry classification", () => {
  it("classifies network and temporary server failures as retriable", () => {
    expect(classifyTransactionError(new TypeError("fetch failed")).kind).toBe("retriable")
    expect(classifyTransactionError(new Response(null, { status: 503 })).kind).toBe("retriable")
    expect(
      classifyTransactionError(new DOMException("aborted", "AbortError")).kind
    ).toBe("retriable")
  })

  it("keeps authentication, conflict, and validation failures distinct", () => {
    expect(classifyTransactionError(new Response(null, { status: 401 })).kind).toBe(
      "authentication"
    )
    expect(classifyTransactionError(new Response(null, { status: 409 })).kind).toBe("conflict")
    expect(classifyTransactionError(new Response(null, { status: 422 })).kind).toBe("permanent")
  })

  it("respects explicit handler classifications", () => {
    const error = new TransactionExecutionError({
      kind: "conflict",
      code: "TEST_CONFLICT",
      message: "Changed",
    })
    expect(classifyTransactionError(error)).toMatchObject({
      kind: "conflict",
      code: "TEST_CONFLICT",
    })
  })

  it("uses capped exponential backoff and Retry-After with jitter", () => {
    expect(computeRetryDelayMs(1, undefined, () => 0.5)).toBe(3_000)
    expect(computeRetryDelayMs(2, undefined, () => 0.5)).toBe(6_000)
    expect(computeRetryDelayMs(99, undefined, () => 0.5)).toBe(300_000)
    expect(computeRetryDelayMs(1, 12_000)).toBe(12_000)
    expect(computeRetryDelayMs(1, 999_999)).toBe(300_000)
    expect(TRANSACTION_POLICY.maxAutomaticRetries).toBe(8)
  })
})
