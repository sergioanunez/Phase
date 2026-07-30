import { beforeEach, describe, expect, it, vi } from "vitest"
import { createInMemoryServerTxPrisma } from "@/lib/server-transactions/test-utils"
import {
  applyVersionedUpdate,
  assertExpectedVersion,
  classifyOutboxError,
  computeOutboxRetryDelayMs,
  enqueueOutboxMessage,
  envelopeHttpStatus,
  executeIdempotentMutation,
  isValidIdempotencyKey,
  OUTBOX_TYPES,
  PermanentRejectionError,
  parseStoredEnvelope,
  processOutboxBatch,
  RetryableMutationError,
  SERVER_TX_POLICY,
  UncertainOutcomeError,
  VersionConflictError,
  type AppliedEnvelope,
  type TransactionEnvelope,
} from "@/lib/server-transactions"

describe("idempotency key validation", () => {
  it("accepts valid keys", () => {
    expect(isValidIdempotencyKey("abcdefgh")).toBe(true)
    expect(isValidIdempotencyKey("tx.abc-123_DEF:ok")).toBe(true)
  })

  it("rejects invalid keys", () => {
    expect(isValidIdempotencyKey("short")).toBe(false)
    expect(isValidIdempotencyKey("bad key!!")).toBe(false)
  })
})

describe("executeIdempotentMutation", () => {
  let prisma: ReturnType<typeof createInMemoryServerTxPrisma>

  beforeEach(() => {
    prisma = createInMemoryServerTxPrisma()
  })

  it("first request claims and executes with context.tx", async () => {
    const execute = vi.fn(async (ctx) => {
      expect(ctx.tx).toBeTruthy()
      expect(ctx.companyId).toBe("co-a")
      expect(ctx.mutationId).toBeTruthy()
      return {
        status: "applied" as const,
        idempotencyKey: "key-first-01",
        entityId: "e1",
        entityType: "Test",
        version: 2,
      } satisfies AppliedEnvelope
    })

    const result = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      actorUserId: "u1",
      idempotencyKey: "key-first-01",
      mutationType: "TEST",
      execute,
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.status).toBe("applied")
    expect(prisma.__getMutations()[0].status).toBe("succeeded")
  })

  it("duplicate request returns stored result without re-executing", async () => {
    const execute = vi.fn(async () => ({
      status: "applied" as const,
      idempotencyKey: "key-dup-0001",
      entity: { n: 1 },
    }))

    const first = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-dup-0001",
      mutationType: "TEST",
      execute,
    })
    const second = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-dup-0001",
      mutationType: "TEST",
      execute,
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({
      status: "applied",
      mutationId: first.mutationId,
      entity: { n: 1 },
    })
  })

  it("transient failure reuses the same idempotency key", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        new RetryableMutationError({ code: "DATABASE_TRANSIENT", message: "db blip" })
      )
      .mockResolvedValueOnce({
        status: "applied" as const,
        idempotencyKey: "key-retry-001",
        entity: { ok: true },
      })

    const first = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-retry-001",
      mutationType: "TEST",
      execute,
    })
    expect(first.status).toBe("rejected")
    if (first.status === "rejected") {
      expect(first.error.retryable).toBe(true)
      expect(first.error.message).toBe("db blip")
      expect(first.error.message).not.toMatch(/prisma|ECONNREFUSED/i)
    }
    // Claim rolled back — no durable row (or only retryable_failed absent)
    expect(prisma.__getMutations()).toHaveLength(0)

    const second = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-retry-001",
      mutationType: "TEST",
      execute,
    })
    expect(execute).toHaveBeenCalledTimes(2)
    expect(second.status).toBe("applied")
  })

  it("permanent rejection replays without re-execution", async () => {
    const execute = vi.fn(async () => {
      throw new PermanentRejectionError({
        code: "INVALID_TRANSITION",
        message: "Task cannot be started",
        httpHint: "VALIDATION",
      })
    })

    const first = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-perm-0001",
      mutationType: "TEST",
      execute,
    })
    const second = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-perm-0001",
      mutationType: "TEST",
      execute,
    })

    expect(first.status).toBe("rejected")
    expect(second.status).toBe("rejected")
    expect(execute).toHaveBeenCalledTimes(1)
    expect(prisma.__getMutations()[0].status).toBe("rejected")
    if (second.status === "rejected") {
      expect(second.error.retryable).toBe(false)
      expect(second.error.code).toBe("INVALID_TRANSITION")
    }
  })

  it("uncertain status never auto-reexecutes", async () => {
    const execute = vi.fn(async () => {
      throw new UncertainOutcomeError({ code: "SIDE_EFFECT_AMBIGUOUS" })
    })

    const first = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-uncert-01",
      mutationType: "TEST",
      execute,
    })
    const second = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-uncert-01",
      mutationType: "TEST",
      execute,
    })

    expect(first.status).toBe("uncertain")
    expect(second.status).toBe("uncertain")
    expect(execute).toHaveBeenCalledTimes(1)
    expect(prisma.__getMutations()[0].status).toBe("uncertain")
    expect(envelopeHttpStatus(first)).toBe(409)
  })

  it("concurrent same-key callers still execute once", async () => {
    let enteredExecute = 0
    let releaseExecute: () => void = () => {}
    const holdExecute = new Promise<void>((r) => {
      releaseExecute = r
    })
    let signalClaimed: () => void = () => {}
    const claimed = new Promise<void>((r) => {
      signalClaimed = r
    })

    const execute = vi.fn(async () => {
      enteredExecute++
      signalClaimed()
      await holdExecute
      return {
        status: "applied" as const,
        idempotencyKey: "key-race-0001",
        entity: { once: true },
      }
    })

    const p1 = executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-race-0001",
      mutationType: "TEST",
      execute,
    })
    await claimed
    const p2 = executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-race-0001",
      mutationType: "TEST",
      execute,
    })
    releaseExecute()
    const [a, b] = await Promise.all([p1, p2])

    expect(execute).toHaveBeenCalledTimes(1)
    expect(enteredExecute).toBe(1)
    expect([a.status, b.status].every((s) => s === "applied" || s === "in_progress")).toBe(
      true
    )
  })

  it("transaction rollback leaves key retryable", async () => {
    let attempt = 0
    const execute = async () => {
      attempt++
      if (attempt === 1) throw new RetryableMutationError()
      return {
        status: "applied" as const,
        idempotencyKey: "key-rollback1",
      }
    }
    await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-rollback1",
      mutationType: "TEST",
      execute,
    })
    expect(prisma.__getMutations()).toHaveLength(0)

    const ok = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-rollback1",
      mutationType: "TEST",
      execute,
    })
    expect(ok.status).toBe("applied")
    expect(attempt).toBe(2)
  })

  it("raw internal error messages are not exposed", async () => {
    const execute = vi.fn(async () => {
      throw Object.assign(new Error("prisma://secret-host ECONNREFUSED P1001"), {
        code: "P1001",
      })
    })
    const result = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-safe-msg1",
      mutationType: "TEST",
      execute,
    })
    expect(result.status).toBe("rejected")
    if (result.status === "rejected") {
      expect(result.error.retryable).toBe(true)
      expect(result.error.message).not.toContain("secret-host")
      expect(result.error.message).not.toContain("ECONNREFUSED")
      expect(result.error.code).toBe("DATABASE_TRANSIENT")
    }
  })

  it("corrupted responseData does not replay blindly", async () => {
    prisma.__seedMutation({
      companyId: "co-a",
      idempotencyKey: "key-corrupt01",
      status: "succeeded",
      responseData: { status: "conflict", idempotencyKey: "key-corrupt01" },
    })
    const execute = vi.fn()
    const result = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-corrupt01",
      mutationType: "TEST",
      execute,
    })
    expect(execute).not.toHaveBeenCalled()
    expect(result.status).toBe("uncertain")
    expect(result.status === "uncertain" && result.error.code).toBe("CORRUPTED_RESPONSE_DATA")
  })

  it("stale committed processing becomes uncertain and does not re-execute", async () => {
    const stale = new Date(Date.now() - SERVER_TX_POLICY.staleProcessedMutationMs - 1000)
    prisma.__seedMutation({
      companyId: "co-a",
      idempotencyKey: "key-stale-proc",
      status: "processing",
      updatedAt: stale,
      createdAt: stale,
    })
    const execute = vi.fn()
    const result = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-stale-proc",
      mutationType: "TEST",
      execute,
    })
    expect(execute).not.toHaveBeenCalled()
    expect(result.status).toBe("uncertain")
    expect(prisma.__getMutations()[0].status).toBe("uncertain")
  })

  it("fresh committed processing returns in_progress", async () => {
    prisma.__seedMutation({
      companyId: "co-a",
      idempotencyKey: "key-fresh-proc",
      status: "processing",
      updatedAt: new Date(),
    })
    const result = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-fresh-proc",
      mutationType: "TEST",
      execute: async () => {
        throw new Error("should not run")
      },
    })
    expect(result.status).toBe("in_progress")
    expect(envelopeHttpStatus(result)).toBe(202)
  })

  it("persisted retryable_failed can be reclaimed with same key", async () => {
    prisma.__seedMutation({
      companyId: "co-a",
      idempotencyKey: "key-reclaim01",
      status: "retryable_failed",
      errorCode: "DATABASE_TRANSIENT",
    })
    const execute = vi.fn(async () => ({
      status: "applied" as const,
      idempotencyKey: "key-reclaim01",
      entity: { reclaimed: true },
    }))
    const result = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-reclaim01",
      mutationType: "TEST",
      execute,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.status).toBe("applied")
    expect(prisma.__getMutations()[0].status).toBe("succeeded")
  })

  it("enforces tenant-scoped uniqueness", async () => {
    const execute = vi.fn(async (ctx) => ({
      status: "applied" as const,
      idempotencyKey: "shared-key-01",
      entity: { tenant: ctx.companyId },
    }))

    const a = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "shared-key-01",
      mutationType: "TEST",
      execute,
    })
    const b = await executeIdempotentMutation({
      prisma,
      companyId: "co-b",
      idempotencyKey: "shared-key-01",
      mutationType: "TEST",
      execute,
    })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(a.status === "applied" && a.entity).toEqual({ tenant: "co-a" })
    expect(b.status === "applied" && b.entity).toEqual({ tenant: "co-b" })
  })

  it("stores conflict envelope as succeeded for safe replay", async () => {
    const result = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-conflict1",
      mutationType: "TEST",
      execute: async () => {
        throw new VersionConflictError({
          code: "VERSION_CONFLICT",
          message: "stale",
          baseVersion: 1,
          serverVersion: 3,
        })
      },
    })
    expect(result.status).toBe("conflict")
    expect(envelopeHttpStatus(result)).toBe(409)

    const replay = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-conflict1",
      mutationType: "TEST",
      execute: async () => {
        throw new Error("should not run")
      },
    })
    expect(replay.status).toBe("conflict")
    expect(prisma.__getMutations()[0].status).toBe("succeeded")
  })

  it("rejects invalid idempotency key without claiming", async () => {
    const execute = vi.fn()
    const result = await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "bad!",
      mutationType: "TEST",
      execute,
    })
    expect(result.status).toBe("rejected")
    expect(execute).not.toHaveBeenCalled()
  })
})

describe("response envelope hardening", () => {
  it("maps statuses including retryable rejected and uncertain", () => {
    expect(envelopeHttpStatus({ status: "applied", idempotencyKey: "k" })).toBe(200)
    expect(envelopeHttpStatus({ status: "noop", idempotencyKey: "k" })).toBe(200)
    expect(
      envelopeHttpStatus({
        status: "in_progress",
        idempotencyKey: "k",
        error: { code: "IN_PROGRESS", message: "x", retryable: true },
      })
    ).toBe(202)
    expect(
      envelopeHttpStatus({
        status: "conflict",
        idempotencyKey: "k",
        conflict: { code: "VERSION_CONFLICT", message: "x" },
      })
    ).toBe(409)
    expect(
      envelopeHttpStatus({
        status: "uncertain",
        idempotencyKey: "k",
        error: { code: "UNCERTAIN", message: "x", retryable: false },
      })
    ).toBe(409)
    expect(
      envelopeHttpStatus({
        status: "rejected",
        idempotencyKey: "k",
        error: { code: "X", message: "x", retryable: true },
      })
    ).toBe(503)
    expect(
      envelopeHttpStatus({
        status: "rejected",
        idempotencyKey: "k",
        error: { code: "NOT_FOUND", message: "x", retryable: false },
      })
    ).toBe(404)
  })

  it("parseStoredEnvelope rejects impossible combinations", () => {
    expect(
      parseStoredEnvelope(
        { status: "rejected", idempotencyKey: "k" },
        "k"
      )
    ).toBeNull()
    expect(
      parseStoredEnvelope(
        { status: "conflict", idempotencyKey: "k" },
        "k"
      )
    ).toBeNull()
    expect(
      parseStoredEnvelope(
        {
          status: "applied",
          idempotencyKey: "k",
          entity: { id: "1" },
        },
        "k"
      )?.status
    ).toBe("applied")
  })
})

describe("versioning", () => {
  let prisma: ReturnType<typeof createInMemoryServerTxPrisma>

  beforeEach(() => {
    prisma = createInMemoryServerTxPrisma()
    prisma.__seedEntity({ id: "p1", companyId: "co-a", version: 2, title: "A" })
  })

  it("assertExpectedVersion throws on mismatch", () => {
    expect(() =>
      assertExpectedVersion({ currentVersion: 2, expectedVersion: 1, entityType: "PunchItem" })
    ).toThrow(VersionConflictError)
  })

  it("correct baseVersion applies and increments", async () => {
    const result = await applyVersionedUpdate({
      delegate: prisma.punchItem,
      id: "p1",
      companyId: "co-a",
      expectedVersion: 2,
      data: { title: "B" },
    })
    expect(result).toEqual({ outcome: "applied", newVersion: 3 })
  })

  it("stale baseVersion returns conflict", async () => {
    const result = await applyVersionedUpdate({
      delegate: prisma.punchItem,
      id: "p1",
      companyId: "co-a",
      expectedVersion: 1,
      data: { title: "B" },
      serverValueSelect: { title: true },
    })
    expect(result.outcome).toBe("conflict")
  })

  it("missing entity distinguished from conflict", async () => {
    const result = await applyVersionedUpdate({
      delegate: prisma.punchItem,
      id: "missing",
      companyId: "co-a",
      expectedVersion: 1,
      data: { title: "B" },
    })
    expect(result).toEqual({ outcome: "missing" })
  })
})

describe("outbox", () => {
  let prisma: ReturnType<typeof createInMemoryServerTxPrisma>

  beforeEach(() => {
    prisma = createInMemoryServerTxPrisma()
  })

  it("row created transactionally with test mutation", async () => {
    await executeIdempotentMutation({
      prisma,
      companyId: "co-a",
      idempotencyKey: "key-outbox-01",
      mutationType: "TEST",
      execute: async ({ tx }) => {
        const row = await enqueueOutboxMessage(tx, {
          companyId: "co-a",
          type: OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT,
          deduplicationKey: "noop:key-outbox-01",
          payload: { template: "noop_test_v1" },
        })
        return {
          status: "applied",
          idempotencyKey: "key-outbox-01",
          sideEffects: [{ type: row.type, status: "pending", referenceId: row.id }],
        } satisfies TransactionEnvelope
      },
    })
    expect(prisma.__getOutbox()).toHaveLength(1)
  })

  it("transaction rollback removes outbox row", async () => {
    await expect(
      prisma.$transaction(async (tx: any) => {
        await enqueueOutboxMessage(tx, {
          companyId: "co-a",
          type: OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT,
          deduplicationKey: "noop:rollback",
          payload: { template: "noop_test_v1" },
        })
        throw new Error("force rollback")
      })
    ).rejects.toThrow("force rollback")
    expect(prisma.__getOutbox()).toHaveLength(0)
  })

  it("duplicate deduplicationKey creates one row", async () => {
    await prisma.$transaction(async (tx: any) => {
      const a = await enqueueOutboxMessage(tx, {
        companyId: "co-a",
        type: OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT,
        deduplicationKey: "same-dedupe",
        payload: { n: 1 },
      })
      const b = await enqueueOutboxMessage(tx, {
        companyId: "co-a",
        type: OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT,
        deduplicationKey: "same-dedupe",
        payload: { n: 2 },
      })
      expect(a.id).toBe(b.id)
    })
    expect(prisma.__getOutbox()).toHaveLength(1)
  })

  it("eligible row claimed once and provider reference saved", async () => {
    await enqueueOutboxMessage(prisma, {
      companyId: "co-a",
      type: OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT,
      deduplicationKey: "claim-once",
      payload: {},
    })
    const adapter = vi.fn(async (msg: { id: string }) => ({
      providerReference: `sid:${msg.id}`,
    }))
    const first = await processOutboxBatch({
      prisma,
      workerId: "w1",
      adapters: { [OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT]: adapter },
    })
    const second = await processOutboxBatch({
      prisma,
      workerId: "w2",
      adapters: { [OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT]: adapter },
    })
    expect(first.succeeded).toBe(1)
    expect(second.claimed).toBe(0)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it("stale claim recovery and ownership token blocks stale completion", async () => {
    const row = await enqueueOutboxMessage(prisma, {
      companyId: "co-a",
      type: OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT,
      deduplicationKey: "stale-lock",
      payload: {},
    })
    const staleTime = new Date(Date.now() - 120_000)
    await prisma.outboxMessage.updateMany({
      where: { id: row.id },
      data: {
        status: "processing",
        lockedAt: staleTime,
        lockedBy: "old-worker",
        processingAttemptId: "old-attempt",
      },
    })

    const adapter = vi.fn(async () => ({ providerReference: "ok" }))
    const result = await processOutboxBatch({
      prisma,
      workerId: "new-worker",
      adapters: { [OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT]: adapter },
    })
    expect(result.succeeded).toBe(1)

    const blocked = await prisma.outboxMessage.updateMany({
      where: {
        id: row.id,
        status: "processing",
        processingAttemptId: "old-attempt",
      },
      data: { status: "permanently_failed" },
    })
    expect(blocked.count).toBe(0)
    expect(prisma.__getOutbox()[0].status).toBe("succeeded")
  })

  it("retryable failure schedules retry; permanent stops", async () => {
    const row = await enqueueOutboxMessage(prisma, {
      companyId: "co-a",
      type: OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT,
      deduplicationKey: "retry-path",
      payload: {},
      maxAttempts: 2,
    })

    const transient = await processOutboxBatch({
      prisma,
      adapters: {
        [OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT]: async () => {
          throw Object.assign(new Error("rate limited"), { status: 429 })
        },
      },
    })
    expect(transient.retried).toBe(1)

    await prisma.outboxMessage.updateMany({
      where: { id: row.id },
      data: { nextAttemptAt: new Date(0) },
    })

    const permanent = await processOutboxBatch({
      prisma,
      adapters: {
        [OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT]: async () => {
          throw Object.assign(new Error("bad phone"), { code: 21211 })
        },
      },
    })
    expect(permanent.failed).toBe(1)
    expect(prisma.__getOutbox()[0].status).toBe("permanently_failed")
  })

  it("duplicate outbox replay after success does not invoke adapter twice", async () => {
    await enqueueOutboxMessage(prisma, {
      companyId: "co-a",
      type: OUTBOX_TYPES.SEND_CONFIRMATION_SMS,
      deduplicationKey: "sms:task:1",
      payload: { taskId: "t1", template: "confirmation_v1" },
    })
    const twilio = vi.fn(async () => ({ providerReference: "SM123" }))
    await processOutboxBatch({
      prisma,
      adapters: { [OUTBOX_TYPES.SEND_CONFIRMATION_SMS]: twilio },
    })
    await processOutboxBatch({
      prisma,
      adapters: { [OUTBOX_TYPES.SEND_CONFIRMATION_SMS]: twilio },
    })
    expect(twilio).toHaveBeenCalledTimes(1)
  })
})

describe("retry classification", () => {
  it("classifies Twilio and config errors", () => {
    expect(classifyOutboxError({ code: 20429, message: "too many" }).kind).toBe("retriable")
    expect(classifyOutboxError({ code: 21211, message: "invalid" }).kind).toBe("permanent")
    expect(classifyOutboxError(new Error("Missing Twilio credentials")).kind).toBe(
      "configuration"
    )
  })

  it("applies capped exponential backoff with jitter", () => {
    const d1 = computeOutboxRetryDelayMs(1, undefined, () => 0.5)
    const d2 = computeOutboxRetryDelayMs(5, undefined, () => 0.5)
    expect(d2).toBeGreaterThan(d1)
    expect(d2).toBeLessThanOrEqual(5 * 60_000)
  })
})
