import { getTransactionDb } from "@/lib/transactions/db"
import { transactionLog } from "@/lib/transactions/logger"
import type {
  StoredTransaction,
  TransactionDraft,
  TransactionScope,
  TransactionStatus,
  TransactionType,
} from "@/lib/transactions/types"

type QueueChangeListener = (scope: TransactionScope) => void | Promise<void>

const COUNTED_STATUSES: TransactionStatus[] = [
  "pending",
  "processing",
  "retrying",
  "blocked",
  "conflict",
  "permanently_failed",
]

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export class TransactionQueue {
  constructor(private readonly onChange?: QueueChangeListener) {}

  async enqueue<T extends TransactionType>(draft: TransactionDraft<T>): Promise<StoredTransaction<T>> {
    validateScope(draft.scope)
    const now = Date.now()
    const id = createId()
    const dependsOn = [...new Set(draft.dependsOn ?? [])]
    await this.assertNoDependencyCycle(id, dependsOn)

    const transaction: StoredTransaction<T> = {
      id,
      idempotencyKey: createId(),
      type: draft.type,
      tenantId: draft.scope.tenantId,
      userId: draft.scope.userId,
      houseId: draft.houseId ?? null,
      entityId: draft.entityId ?? null,
      payload: draft.payload,
      createdAt: now,
      updatedAt: now,
      status: "pending",
      priority: draft.priority ?? 0,
      retryCount: 0,
      nextRetryAt: null,
      lastAttemptAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      baseVersion: draft.baseVersion ?? null,
      baseUpdatedAt: draft.baseUpdatedAt ?? null,
      dependsOn,
      blockedReason: null,
      resultMetadata: null,
      processingAttemptId: null,
      discardedAt: null,
      discardReason: null,
      resolution: null,
      authFailureCount: 0,
    }

    const db = await getTransactionDb()
    await db.add("transactions", transaction as StoredTransaction)
    transactionLog("transaction_queued", {
      transactionId: transaction.id,
      type: transaction.type,
      tenantId: transaction.tenantId,
      userId: transaction.userId,
    })
    await this.changed(draft.scope)
    return transaction
  }

  async get(id: string): Promise<StoredTransaction | undefined> {
    return (await getTransactionDb()).get("transactions", id)
  }

  async put(transaction: StoredTransaction): Promise<void> {
    transaction.updatedAt = Date.now()
    await (await getTransactionDb()).put("transactions", transaction)
    await this.changed({ tenantId: transaction.tenantId, userId: transaction.userId })
  }

  /**
   * Conditional update: only applies when the predicate matches the current row.
   * Used for processing-attempt ownership so late completions cannot overwrite.
   */
  async updateIf(
    id: string,
    predicate: (current: StoredTransaction) => boolean,
    patch: Partial<StoredTransaction>
  ): Promise<StoredTransaction | null> {
    const db = await getTransactionDb()
    const tx = db.transaction("transactions", "readwrite")
    const current = await tx.store.get(id)
    if (!current || !predicate(current)) {
      await tx.done
      return null
    }
    const updated: StoredTransaction = {
      ...current,
      ...patch,
      id: current.id,
      updatedAt: Date.now(),
    }
    await tx.store.put(updated)
    await tx.done
    await this.changed({ tenantId: updated.tenantId, userId: updated.userId })
    return updated
  }

  async update(id: string, patch: Partial<StoredTransaction>): Promise<StoredTransaction> {
    const db = await getTransactionDb()
    const transaction = await db.get("transactions", id)
    if (!transaction) throw new Error(`Transaction not found: ${id}`)
    const updated = { ...transaction, ...patch, id: transaction.id, updatedAt: Date.now() }
    await db.put("transactions", updated)
    await this.changed({ tenantId: updated.tenantId, userId: updated.userId })
    return updated
  }

  async listForScope(scope: TransactionScope): Promise<StoredTransaction[]> {
    validateScope(scope)
    const records = await (
      await getTransactionDb()
    ).getAllFromIndex("transactions", "by-scope", [scope.tenantId, scope.userId])
    return records.sort((a, b) => a.createdAt - b.createdAt)
  }

  async listEligible(scope: TransactionScope, now = Date.now()): Promise<StoredTransaction[]> {
    const records = await this.listForScope(scope)
    return records
      .filter(
        (transaction) =>
          (transaction.status === "pending" || transaction.status === "retrying") &&
          (transaction.nextRetryAt == null || transaction.nextRetryAt <= now)
      )
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
  }

  async getEarliestFutureRetryAt(scope: TransactionScope, now = Date.now()): Promise<number | null> {
    const records = await this.listForScope(scope)
    let earliest: number | null = null
    for (const transaction of records) {
      if (
        transaction.status === "retrying" &&
        transaction.nextRetryAt != null &&
        transaction.nextRetryAt > now
      ) {
        if (earliest == null || transaction.nextRetryAt < earliest) {
          earliest = transaction.nextRetryAt
        }
      }
    }
    return earliest
  }

  async getDependencies(transaction: StoredTransaction): Promise<StoredTransaction[]> {
    if (transaction.dependsOn.length === 0) return []
    const db = await getTransactionDb()
    const dependencies = await Promise.all(
      transaction.dependsOn.map((dependencyId) => db.get("transactions", dependencyId))
    )
    return dependencies.filter((item): item is StoredTransaction => Boolean(item))
  }

  async listDependents(scope: TransactionScope, parentId: string): Promise<StoredTransaction[]> {
    const records = await this.listForScope(scope)
    return records.filter((transaction) => transaction.dependsOn.includes(parentId))
  }

  async getCounts(scope: TransactionScope): Promise<Record<TransactionStatus, number>> {
    const counts = Object.fromEntries(
      [
        "pending",
        "processing",
        "retrying",
        "blocked",
        "conflict",
        "succeeded",
        "permanently_failed",
        "discarded",
      ].map((status) => [status, 0])
    ) as Record<TransactionStatus, number>

    for (const transaction of await this.listForScope(scope)) {
      counts[transaction.status]++
    }
    return counts
  }

  async hasOutstanding(scope: TransactionScope): Promise<boolean> {
    const counts = await this.getCounts(scope)
    return COUNTED_STATUSES.some((status) => counts[status] > 0)
  }

  private async assertNoDependencyCycle(id: string, dependsOn: string[]): Promise<void> {
    if (dependsOn.includes(id)) throw new Error("A transaction cannot depend on itself")
    const db = await getTransactionDb()
    const visited = new Set<string>()

    const visits = async (candidateId: string): Promise<boolean> => {
      if (candidateId === id) return true
      if (visited.has(candidateId)) return false
      visited.add(candidateId)
      const candidate = await db.get("transactions", candidateId)
      if (!candidate) return false
      for (const dependencyId of candidate.dependsOn) {
        if (await visits(dependencyId)) return true
      }
      return false
    }

    for (const dependencyId of dependsOn) {
      if (await visits(dependencyId)) throw new Error("Circular transaction dependency detected")
    }
  }

  private async changed(scope: TransactionScope): Promise<void> {
    await this.onChange?.(scope)
  }
}

function validateScope(scope: TransactionScope): void {
  if (!scope.tenantId.trim() || !scope.userId.trim()) {
    throw new Error("Transactions require tenantId and userId")
  }
}
