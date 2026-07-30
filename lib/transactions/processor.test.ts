import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  closeTransactionDb,
  ConnectivityService,
  createTestEngine,
  noOpTestTransactionHandler,
  resetTransactionDatabaseForTests,
  TransactionCoordinator,
  TransactionHandlerRegistry,
  TransactionProcessor,
  TransactionQueue,
  TransactionStatusStore,
} from "@/lib/transactions/internal/test-utils"

const scope = { tenantId: "tenant-a", userId: "user-a" }

describe("TransactionProcessor", () => {
  beforeEach(async () => {
    await resetTransactionDatabaseForTests()
  })

  afterEach(async () => {
    Reflect.deleteProperty(navigator, "locks")
    await closeTransactionDb()
  })

  it("persists retry state and reconciles a later success", async () => {
    const queue = new TransactionQueue()
    const registry = new TransactionHandlerRegistry()
    registry.register(noOpTestTransactionHandler)
    const connectivity = new ConnectivityService(async () => true)
    connectivity.reportRequestSuccess()
    const status = new TransactionStatusStore(queue, scope)
    await status.initialize()
    const coordinator = new TransactionCoordinator("processor-retry", "owner-a")
    const processor = new TransactionProcessor(
      queue,
      registry,
      connectivity,
      status,
      coordinator
    )
    const transaction = await queue.enqueue({
      type: "NO_OP_TEST",
      scope,
      payload: { value: "saved", failAttempts: 1, failureKind: "network" },
    })

    const first = await processor.process(scope)
    expect(first.retried).toBe(1)
    expect((await queue.get(transaction.id))?.status).toBe("retrying")

    await new Promise((resolve) => setTimeout(resolve, 5))
    connectivity.reportRequestSuccess()
    const second = await processor.process(scope)
    const stored = await queue.get(transaction.id)

    expect(second.succeeded).toBe(1)
    expect(stored?.status).toBe("succeeded")
    expect(stored?.resultMetadata).toMatchObject({
      handler: "NO_OP_TEST",
      reconciledValue: "saved",
      attempt: 2,
    })
  })

  it("prevents two processors from executing the same transaction", async () => {
    const queue = new TransactionQueue()
    const execute = vi.fn(noOpTestTransactionHandler.execute)
    const registry = new TransactionHandlerRegistry()
    registry.register({ ...noOpTestTransactionHandler, execute })
    const firstConnectivity = new ConnectivityService(async () => true)
    const secondConnectivity = new ConnectivityService(async () => true)
    firstConnectivity.reportRequestSuccess()
    secondConnectivity.reportRequestSuccess()

    const firstStatus = new TransactionStatusStore(queue, scope)
    const secondStatus = new TransactionStatusStore(queue, scope)
    const first = new TransactionProcessor(
      queue,
      registry,
      firstConnectivity,
      firstStatus,
      new TransactionCoordinator("processor-lock", "owner-a")
    )
    const second = new TransactionProcessor(
      queue,
      registry,
      secondConnectivity,
      secondStatus,
      new TransactionCoordinator("processor-lock", "owner-b")
    )
    await queue.enqueue({
      type: "NO_OP_TEST",
      scope,
      payload: { value: "once", delayMs: 25 },
    })

    const results = await Promise.all([first.process(scope), second.process(scope)])

    expect(results.filter((result) => result.acquired)).toHaveLength(1)
    expect(execute).toHaveBeenCalledOnce()
  })

  it("times out hanging handlers and rejects late success for a stolen attempt", async () => {
    const queue = new TransactionQueue()
    const registry = new TransactionHandlerRegistry()
    registry.register({
      ...noOpTestTransactionHandler,
      executionTimeoutMs: 20,
    })
    const connectivity = new ConnectivityService(async () => true)
    connectivity.reportRequestSuccess()
    const status = new TransactionStatusStore(queue, scope)
    await status.initialize()
    const processor = new TransactionProcessor(
      queue,
      registry,
      connectivity,
      status,
      new TransactionCoordinator("timeout-test", "owner-a")
    )

    const transaction = await queue.enqueue({
      type: "NO_OP_TEST",
      scope,
      payload: { hangForever: true, executionTimeoutMs: 20, maxAutomaticRetries: 3 },
    })

    const result = await processor.process(scope)
    expect(result.retried).toBe(1)
    const afterTimeout = await queue.get(transaction.id)
    expect(afterTimeout?.status).toBe("retrying")
    expect(afterTimeout?.lastErrorCode).toBe("TIMEOUT")

    const staleAttempt = "stale-attempt"
    await queue.update(transaction.id, {
      status: "processing",
      processingAttemptId: "newer-attempt",
    })
    const late = await queue.updateIf(
      transaction.id,
      (current) =>
        current.status === "processing" && current.processingAttemptId === staleAttempt,
      { status: "succeeded", processingAttemptId: null }
    )
    expect(late).toBeNull()
    expect((await queue.get(transaction.id))?.status).toBe("processing")
  })

  it("exhausts automatic retries then allows manual restart via engine", async () => {
    const connectivity = new ConnectivityService(async () => true)
    connectivity.reportRequestSuccess()
    const engine = await createTestEngine(scope, { connectivity })
    const dispatched = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: {
        failAttempts: 99,
        failureKind: "network",
        maxAutomaticRetries: 2,
      },
    })

    for (let i = 0; i < 4; i++) {
      connectivity.reportRequestSuccess()
      await engine.sync()
      await new Promise((r) => setTimeout(r, 5))
    }

    const failed = await engine.__unsafeGetStoredTransaction(dispatched.transactionId)
    expect(failed?.status).toBe("permanently_failed")
    expect(failed?.lastErrorCode).toBe("RETRY_EXHAUSTED")

    await engine.retry(dispatched.transactionId)
    const restarted = await engine.__unsafeGetStoredTransaction(dispatched.transactionId)
    expect(restarted?.status).toBe("pending")
    expect(restarted?.retryCount).toBe(0)
    engine.stop()
  })
})
