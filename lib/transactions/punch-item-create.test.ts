import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "fake-indexeddb/auto"
import { closeTransactionDb, resetTransactionDatabaseForTests } from "@/lib/transactions/db"
import {
  createClientPunchItemId,
  listLocalPunchItemsForTask,
  mergePunchLists,
  reconcileLocalPunchItem,
  upsertLocalPunchItem,
} from "@/lib/transactions/local-punch-items"
import { punchItemCreateHandler } from "@/lib/transactions/handlers/punch-item-create"
import { TransactionExecutionError } from "@/lib/transactions/retry"
import type { StoredTransaction } from "@/lib/transactions/types"

describe("local punch read model", () => {
  beforeEach(async () => {
    await resetTransactionDatabaseForTests()
  })

  afterEach(async () => {
    await closeTransactionDb()
  })

  it("persists optimistic record across reload of store", async () => {
    const id = createClientPunchItemId()
    await upsertLocalPunchItem({
      clientPunchItemId: id,
      tenantId: "co-a",
      userId: "u1",
      homeTaskId: "task-1",
      title: "Fix drip",
      description: null,
      assignedContractorId: null,
      assignedContractorName: null,
      dueDate: null,
      status: "Open",
      syncStatus: "pending",
      transactionId: "tx-1",
      serverPunchItemId: null,
      version: null,
      attentionCode: null,
      attentionMessage: null,
      deviceCreatedAt: new Date().toISOString(),
      updatedAt: Date.now(),
      reconciledAt: null,
    })

    await closeTransactionDb()
    const rows = await listLocalPunchItemsForTask({
      tenantId: "co-a",
      userId: "u1",
      homeTaskId: "task-1",
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe("Fix drip")
    expect(rows[0]?.syncStatus).toBe("pending")
  })

  it("merge avoids duplicate after reconciliation", async () => {
    const clientId = "client-abc12"
    await upsertLocalPunchItem({
      clientPunchItemId: clientId,
      tenantId: "co-a",
      userId: "u1",
      homeTaskId: "task-1",
      title: "Fix drip",
      description: null,
      assignedContractorId: null,
      assignedContractorName: null,
      dueDate: null,
      status: "Open",
      syncStatus: "synced",
      transactionId: "tx-1",
      serverPunchItemId: "srv-1",
      version: 1,
      attentionCode: null,
      attentionMessage: null,
      deviceCreatedAt: new Date().toISOString(),
      updatedAt: Date.now(),
      reconciledAt: Date.now(),
    })

    const locals = await listLocalPunchItemsForTask({
      tenantId: "co-a",
      userId: "u1",
      homeTaskId: "task-1",
    })
    const merged = mergePunchLists({
      serverItems: [{ id: "srv-1", title: "Fix drip" }],
      localItems: locals,
      mapLocal: (l) => ({ id: l.clientPunchItemId, title: l.title }),
    })
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe("srv-1")
  })

  it("reconcile sets synced status", async () => {
    const id = createClientPunchItemId()
    await upsertLocalPunchItem({
      clientPunchItemId: id,
      tenantId: "co-a",
      userId: "u1",
      homeTaskId: "task-1",
      title: "A",
      description: null,
      assignedContractorId: null,
      assignedContractorName: null,
      dueDate: null,
      status: "Open",
      syncStatus: "syncing",
      transactionId: "tx",
      serverPunchItemId: null,
      version: null,
      attentionCode: null,
      attentionMessage: null,
      deviceCreatedAt: new Date().toISOString(),
      updatedAt: Date.now(),
      reconciledAt: null,
    })
    await reconcileLocalPunchItem({
      clientPunchItemId: id,
      serverPunchItemId: "srv-9",
      version: 1,
    })
    const rows = await listLocalPunchItemsForTask({
      tenantId: "co-a",
      userId: "u1",
      homeTaskId: "task-1",
    })
    expect(rows[0]?.syncStatus).toBe("synced")
    expect(rows[0]?.serverPunchItemId).toBe("srv-9")
  })
})

describe("punchItemCreateHandler envelope mapping", () => {
  const baseTx = {
    id: "tx-1",
    idempotencyKey: "idem-key-12345",
    type: "PUNCH_ITEM_CREATE" as const,
    tenantId: "co-a",
    userId: "u1",
    houseId: "h1",
    entityId: "client-1xxxxxxx",
    payload: {
      clientPunchItemId: "client-1xxxxxxx",
      homeTaskId: "task-1",
      title: "Leak",
      deviceCreatedAt: new Date().toISOString(),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "processing" as const,
    priority: 0,
    retryCount: 0,
    nextRetryAt: null,
    lastAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    baseVersion: null,
    baseUpdatedAt: null,
    dependsOn: [],
    blockedReason: null,
    resultMetadata: null,
    processingAttemptId: "a1",
    discardedAt: null,
    discardReason: null,
    resolution: null,
    authFailureCount: 0,
  } satisfies StoredTransaction<"PUNCH_ITEM_CREATE">

  beforeEach(async () => {
    await resetTransactionDatabaseForTests()
    vi.restoreAllMocks()
  })

  it("maps applied envelope to success metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "applied",
            idempotencyKey: baseTx.idempotencyKey,
            entityId: "srv-1",
            entity: {
              id: "srv-1",
              title: "Leak",
              version: 1,
              createdAt: new Date().toISOString(),
            },
          }),
          { status: 200 }
        )
      )
    )

    const result = await punchItemCreateHandler.execute({
      transaction: baseTx,
      signal: new AbortController().signal,
      attempt: 1,
      scope: { tenantId: "co-a", userId: "u1" },
      processingAttemptId: "a1",
    })
    expect(result.status).toBe("applied")
    expect(result.resultMetadata).toMatchObject({ serverPunchItemId: "srv-1" })
  })

  it("maps retryable rejected to retriable error without new key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "rejected",
            idempotencyKey: baseTx.idempotencyKey,
            error: { code: "DATABASE_TRANSIENT", message: "Temporary server error", retryable: true },
          }),
          { status: 503 }
        )
      )
    )

    await expect(
      punchItemCreateHandler.execute({
        transaction: baseTx,
        signal: new AbortController().signal,
        attempt: 1,
        scope: { tenantId: "co-a", userId: "u1" },
        processingAttemptId: "a1",
      })
    ).rejects.toMatchObject({
      kind: "retriable",
      code: "DATABASE_TRANSIENT",
    } satisfies Partial<TransactionExecutionError>)
  })

  it("maps uncertain to permanent needs_attention", async () => {
    await upsertLocalPunchItem({
      clientPunchItemId: baseTx.payload.clientPunchItemId,
      tenantId: "co-a",
      userId: "u1",
      homeTaskId: "task-1",
      title: "Leak",
      description: null,
      assignedContractorId: null,
      assignedContractorName: null,
      dueDate: null,
      status: "Open",
      syncStatus: "syncing",
      transactionId: baseTx.id,
      serverPunchItemId: null,
      version: null,
      attentionCode: null,
      attentionMessage: null,
      deviceCreatedAt: baseTx.payload.deviceCreatedAt,
      updatedAt: Date.now(),
      reconciledAt: null,
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "uncertain",
            idempotencyKey: baseTx.idempotencyKey,
            error: { code: "UNCERTAIN_OUTCOME", message: "May exist", retryable: false },
          }),
          { status: 409 }
        )
      )
    )

    await expect(
      punchItemCreateHandler.execute({
        transaction: baseTx,
        signal: new AbortController().signal,
        attempt: 1,
        scope: { tenantId: "co-a", userId: "u1" },
        processingAttemptId: "a1",
      })
    ).rejects.toMatchObject({ kind: "permanent" })

    const rows = await listLocalPunchItemsForTask({
      tenantId: "co-a",
      userId: "u1",
      homeTaskId: "task-1",
    })
    expect(rows[0]?.syncStatus).toBe("needs_attention")
  })
})
