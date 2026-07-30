import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeTransactionDb,
  createTestEngine,
  getTransactionDb,
  resetTransactionDatabaseForTests,
  TransactionQueue,
} from "@/lib/transactions/internal/test-utils"
import * as publicApi from "@/lib/transactions"

const scope = { tenantId: "tenant-a", userId: "user-a" }

describe("TransactionQueue persistence", () => {
  beforeEach(async () => {
    await resetTransactionDatabaseForTests()
  })

  afterEach(async () => {
    await closeTransactionDb()
  })

  it("creates the versioned stores and required indexes", async () => {
    const db = await getTransactionDb()
    expect([...db.objectStoreNames].sort()).toEqual([
      "localPunchItems",
      "syncMetadata",
      "transactions",
    ])

    const tx = db.transaction("transactions")
    expect([...tx.store.indexNames]).toEqual([
      "by-created-at",
      "by-dependency",
      "by-next-retry-at",
      "by-scope",
      "by-scope-status",
      "by-status",
    ])
    await tx.done

    const local = db.transaction("localPunchItems")
    expect([...local.store.indexNames].sort()).toEqual([
      "by-scope",
      "by-scope-task",
      "by-sync-status",
    ])
    await local.done
  })

  it("survives a database close and preserves ordering and dependencies", async () => {
    const queue = new TransactionQueue()
    const parent = await queue.enqueue({
      type: "NO_OP_TEST",
      scope,
      payload: { value: "parent" },
    })
    const child = await queue.enqueue({
      type: "NO_OP_TEST",
      scope,
      payload: { value: "child" },
      dependsOn: [parent.id],
    })

    await closeTransactionDb()

    const reopened = new TransactionQueue()
    const records = await reopened.listForScope(scope)
    expect(records.map((record) => record.id)).toEqual([parent.id, child.id])
    expect(records[1]?.dependsOn).toEqual([parent.id])
    expect(records[0]?.idempotencyKey).toBeTruthy()
  })

  it("isolates records by tenant and user", async () => {
    const queue = new TransactionQueue()
    await queue.enqueue({ type: "NO_OP_TEST", scope, payload: {} })
    await queue.enqueue({
      type: "NO_OP_TEST",
      scope: { tenantId: "tenant-a", userId: "user-b" },
      payload: {},
    })

    expect(await queue.listForScope(scope)).toHaveLength(1)
  })
})

describe("Public API encapsulation", () => {
  it("does not export queue/processor/coordination internals from the barrel", () => {
    expect(publicApi.TransactionEngine).toBeTypeOf("function")
    expect("TransactionQueue" in publicApi).toBe(false)
    expect("TransactionProcessor" in publicApi).toBe(false)
    expect("TransactionCoordinator" in publicApi).toBe(false)
    expect("ConnectivityService" in publicApi).toBe(false)
    expect("getTransactionDb" in publicApi).toBe(false)
    expect("computeRetryDelayMs" in publicApi).toBe(false)
  })

  it("injects engine scope and returns a slim dispatch result", async () => {
    await resetTransactionDatabaseForTests()
    const engine = await createTestEngine(scope)
    const result = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { value: "scoped" },
    })

    expect(result).toEqual({
      transactionId: expect.any(String),
      status: "queued",
      optimisticApplied: false,
    })
    expect("retryCount" in result).toBe(false)

    const stored = await engine.__unsafeGetStoredTransaction(result.transactionId)
    expect(stored?.tenantId).toBe(scope.tenantId)
    expect(stored?.userId).toBe(scope.userId)

    await expect(
      engine.dispatch({
        type: "NO_OP_TEST",
        payload: {},
        // @ts-expect-error scope must not be provided by callers
        scope: { tenantId: "other", userId: "other" },
      })
    ).rejects.toMatchObject({ code: "SCOPE_OVERRIDE_FORBIDDEN" })

    engine.stop()
    await closeTransactionDb()
  })
})
