import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  closeTransactionDb,
  resetTransactionDatabaseForTests,
  TransactionCoordinator,
} from "@/lib/transactions/internal/test-utils"

const scope = { tenantId: "tenant-a", userId: "user-a" }

describe("TransactionCoordinator", () => {
  beforeEach(async () => {
    await resetTransactionDatabaseForTests()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await closeTransactionDb()
  })

  it("allows only one IndexedDB lease holder for a scope", async () => {
    const firstCoordinator = new TransactionCoordinator("lease-test", "owner-a", 5_000)
    const secondCoordinator = new TransactionCoordinator("lease-test", "owner-b", 5_000)
    let releaseFirst!: () => void
    let firstStarted!: () => void
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve
    })

    const first = firstCoordinator.withProcessorLock(scope, async () => {
      firstStarted()
      await release
      return "first"
    })
    await started

    const second = await secondCoordinator.withProcessorLock(scope, async () => "second")
    expect(second.acquired).toBe(false)

    releaseFirst()
    await expect(first).resolves.toEqual({ acquired: true, value: "first" })
  })

  it("uses Web Locks when the browser provides them", async () => {
    const request = vi.fn(
      async <T,>(
        _name: string,
        _options: { mode: "exclusive"; ifAvailable: true },
        callback: (lock: unknown) => Promise<T>
      ) => callback({})
    )
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    })

    const coordinator = new TransactionCoordinator("web-lock-test", "owner-a")
    const result = await coordinator.withProcessorLock(scope, async () => 42)

    expect(result).toEqual({ acquired: true, value: 42 })
    expect(request).toHaveBeenCalledOnce()
    Reflect.deleteProperty(navigator, "locks")
  })

  it("broadcasts queue changes through the no-BroadcastChannel fallback", () => {
    vi.stubGlobal("BroadcastChannel", undefined)
    const first = new TransactionCoordinator("fallback-test", "owner-a")
    const second = new TransactionCoordinator("fallback-test", "owner-b")
    const received = vi.fn()
    first.start()
    second.start()
    second.subscribe(received)

    first.broadcast({ type: "queue-changed", scope })

    expect(received).toHaveBeenCalledWith({
      type: "queue-changed",
      scope,
      sourceId: "owner-a",
    })
    first.stop()
    second.stop()
  })
})
