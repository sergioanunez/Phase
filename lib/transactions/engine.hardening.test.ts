import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TransactionEngine } from "@/lib/transactions"
import {
  closeTransactionDb,
  ConnectivityService,
  createTestEngine,
  resetTransactionDatabaseForTests,
} from "@/lib/transactions/internal/test-utils"

const scope = { tenantId: "tenant-a", userId: "user-a" }

describe("TransactionEngine hardening", () => {
  let engine: TransactionEngine | null = null

  beforeEach(async () => {
    await resetTransactionDatabaseForTests()
  })

  afterEach(async () => {
    engine?.stop()
    engine = null
    await closeTransactionDb()
  })

  it("wakes a lone retrying transaction after nextRetryAt without other triggers", async () => {
    const timers: Array<{ at: number; fn: () => void; cleared?: boolean }> = []
    let now = 1_000
    const connectivity = new ConnectivityService(async () => true)
    connectivity.reportRequestSuccess()

    engine = new TransactionEngine(scope, {
      connectivity,
      now: () => now,
      setTimeoutFn: ((fn: () => void, ms?: number) => {
        const handle = { at: now + (ms ?? 0), fn }
        timers.push(handle)
        return handle as unknown as ReturnType<typeof setTimeout>
      }) as typeof setTimeout,
      clearTimeoutFn: ((handle: unknown) => {
        const timer = handle as (typeof timers)[number]
        timer.cleared = true
      }) as typeof clearTimeout,
    })
    await engine.initialize()

    const dispatched = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { failAttempts: 1, failureKind: "network", maxAutomaticRetries: 3 },
    })
    await engine.sync()

    const retrying = await engine.__unsafeGetStoredTransaction(dispatched.transactionId)
    expect(retrying?.status).toBe("retrying")
    expect(retrying?.nextRetryAt).toBeTruthy()

    // Allow async scheduleRetryWake() to register the timer.
    await Promise.resolve()
    await Promise.resolve()

    now = Math.max(now, retrying!.nextRetryAt!)
    const due = timers.filter((timer) => !timer.cleared && timer.at <= now)
    expect(due.length).toBeGreaterThan(0)
    for (const timer of due) {
      timer.cleared = true
      await timer.fn()
    }

    await vi.waitFor(async () => {
      const stored = await engine!.__unsafeGetStoredTransaction(dispatched.transactionId)
      expect(stored?.status).toBe("succeeded")
    })
  })

  it("coalesces multiple immediate sync requests into one processor pass", async () => {
    const connectivity = new ConnectivityService(async () => true)
    connectivity.reportRequestSuccess()
    engine = await createTestEngine(scope, { connectivity, syncDebounceMs: 20 })

    await engine.dispatch({ type: "NO_OP_TEST", payload: { delayMs: 30 } })

    const results = await Promise.all([engine.sync(), engine.sync(), engine.sync()])
    expect(results).toHaveLength(3)
    expect(results.every((result) => result.acquired)).toBe(true)
    expect(results[0]?.processed).toBe(1)
    expect(results[1]?.processed).toBe(results[0]?.processed)
    expect(results[2]?.processed).toBe(results[0]?.processed)
  })

  it("resolves conflicts with keep_server, apply_local, and discard_local", async () => {
    engine = await createTestEngine(scope)
    const conflicted = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { failAttempts: 1, failureKind: "conflict" },
    })
    await engine.sync()
    expect((await engine.__unsafeGetStoredTransaction(conflicted.transactionId))?.status).toBe(
      "conflict"
    )

    await engine.resolveConflict(conflicted.transactionId, { intent: "keep_server" })
    expect((await engine.__unsafeGetStoredTransaction(conflicted.transactionId))?.status).toBe(
      "succeeded"
    )

    const applyTarget = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { failAttempts: 1, failureKind: "conflict", value: "local" },
    })
    await engine.sync()
    await engine.resolveConflict(applyTarget.transactionId, { intent: "apply_local" })
    const rebased = await engine.__unsafeGetStoredTransaction(applyTarget.transactionId)
    expect(rebased?.status).toBe("pending")
    expect(rebased?.resolution).toBe("apply_local")
    await engine.sync()
    expect((await engine.__unsafeGetStoredTransaction(applyTarget.transactionId))?.status).toBe(
      "succeeded"
    )

    const discardTarget = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { failAttempts: 1, failureKind: "conflict" },
    })
    await engine.sync()
    await engine.resolveConflict(discardTarget.transactionId, { intent: "discard_local" })
    expect((await engine.__unsafeGetStoredTransaction(discardTarget.transactionId))?.status).toBe(
      "discarded"
    )
  })

  it("discards pending work and blocks dependents of discarded parents", async () => {
    engine = await createTestEngine(scope)
    const parent = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { failAttempts: 5, failureKind: "network", maxAutomaticRetries: 8 },
    })
    await engine.discard(parent.transactionId, "user cancelled")
    expect((await engine.__unsafeGetStoredTransaction(parent.transactionId))?.status).toBe(
      "discarded"
    )

    const parent2 = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { value: "parent-2" },
    })
    const child = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { value: "child" },
      dependsOn: [parent2.transactionId],
    })
    await engine.discard(parent2.transactionId, "give up")
    await engine.sync()
    const childRow = await engine.__unsafeGetStoredTransaction(child.transactionId)
    expect(childRow?.status).toBe("blocked")
  })

  it("reevaluates a blocked child after its parent succeeds", async () => {
    engine = await createTestEngine(scope)
    const parent = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { failAttempts: 1, failureKind: "conflict" },
    })
    const child = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { value: "child" },
      dependsOn: [parent.transactionId],
    })

    await engine.sync()
    await vi.waitFor(async () => {
      expect((await engine!.__unsafeGetStoredTransaction(parent.transactionId))?.status).toBe(
        "conflict"
      )
    })

    await engine.resolveConflict(parent.transactionId, { intent: "keep_server" })
    await engine.sync()

    await vi.waitFor(async () => {
      const childAfter = await engine!.__unsafeGetStoredTransaction(child.transactionId)
      expect(childAfter?.status).toBe("succeeded")
    })
  })

  it("pauses on 401 and ignores automatic sync until resumeAfterAuthentication", async () => {
    const connectivity = new ConnectivityService(async () => true)
    connectivity.reportRequestSuccess()
    engine = await createTestEngine(scope, { connectivity })

    const dispatched = await engine.dispatch({
      type: "NO_OP_TEST",
      payload: { failAttempts: 1, failureKind: "auth" },
    })
    await engine.sync()
    expect(engine.getStatus().authenticationPaused).toBe(true)
    expect((await engine.__unsafeGetStoredTransaction(dispatched.transactionId))?.status).toBe(
      "pending"
    )

    connectivity.reportRequestSuccess()
    const whilePaused = await engine.sync()
    expect(whilePaused.skippedAuthPause || whilePaused.processed === 0).toBe(true)

    await expect(
      engine.resumeAfterAuthentication({ tenantId: "other", userId: "other" })
    ).rejects.toMatchObject({ code: "SCOPE_MISMATCH" })

    await engine.discard(dispatched.transactionId, "replace")
    await engine.resumeAfterAuthentication(scope)
    expect(engine.getStatus().authenticationPaused).toBe(false)

    const ok = await engine.dispatch({ type: "NO_OP_TEST", payload: { value: "ok" } })
    await engine.sync()
    await vi.waitFor(async () => {
      expect((await engine!.__unsafeGetStoredTransaction(ok.transactionId))?.status).toBe(
        "succeeded"
      )
    })
  })
})
