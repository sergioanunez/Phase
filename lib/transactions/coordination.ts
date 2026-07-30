import { getTransactionDb, scopeKey } from "@/lib/transactions/db"
import { transactionLog } from "@/lib/transactions/logger"
import type { CoordinationMessage, TransactionScope } from "@/lib/transactions/types"
import { TRANSACTION_POLICY } from "@/lib/transactions/types"

type CoordinationListener = (message: CoordinationMessage) => void
type LockResult<T> = { acquired: boolean; value?: T }
type LockManagerLike = {
  request<T>(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<T>
  ): Promise<T>
}

const FALLBACK_STORAGE_KEY = "phase-transaction-coordination"
const localChannelListeners = new Map<string, Set<(message: CoordinationMessage) => void>>()

function createOwnerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `owner-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export class TransactionCoordinator {
  readonly ownerId: string
  private readonly listeners = new Set<CoordinationListener>()
  private channel: BroadcastChannel | null = null
  private started = false

  constructor(
    private readonly channelName = "phase-transactions",
    ownerId = createOwnerId(),
    private readonly leaseDurationMs: number = TRANSACTION_POLICY.leaseDurationMs
  ) {
    this.ownerId = ownerId
  }

  start(): void {
    if (this.started) return
    this.started = true

    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(this.channelName)
      this.channel.addEventListener("message", this.handleBroadcastMessage)
    } else if (typeof window !== "undefined") {
      window.addEventListener("storage", this.handleStorageMessage)
      let localListeners = localChannelListeners.get(this.channelName)
      if (!localListeners) {
        localListeners = new Set()
        localChannelListeners.set(this.channelName, localListeners)
      }
      localListeners.add(this.handleLocalMessage)
    }
  }

  stop(): void {
    if (!this.started) return
    this.channel?.removeEventListener("message", this.handleBroadcastMessage)
    this.channel?.close()
    this.channel = null
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", this.handleStorageMessage)
    }
    if (!this.channel) {
      localChannelListeners.get(this.channelName)?.delete(this.handleLocalMessage)
    }
    this.started = false
  }

  subscribe(listener: CoordinationListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  broadcast(message: Omit<CoordinationMessage, "sourceId">): void {
    const complete = { ...message, sourceId: this.ownerId } as CoordinationMessage
    if (this.channel) {
      this.channel.postMessage(complete)
    } else if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          FALLBACK_STORAGE_KEY,
          JSON.stringify({ channel: this.channelName, message: complete, nonce: Math.random() })
        )
        localStorage.removeItem(FALLBACK_STORAGE_KEY)
      } catch {
        // Storage can be unavailable in private browsing; the IndexedDB lease still protects replay.
      }
    }

    if (!this.channel) {
      for (const listener of localChannelListeners.get(this.channelName) ?? []) {
        listener(complete)
      }
    }
  }

  async withProcessorLock<T>(
    scope: TransactionScope,
    callback: () => Promise<T>
  ): Promise<LockResult<T>> {
    const name = `phase-transactions:${scopeKey(scope.tenantId, scope.userId)}`
    const locks =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { locks?: LockManagerLike }).locks
        : undefined

    if (locks) {
      return locks.request(name, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) return { acquired: false }
        transactionLog("processor_lock_acquired", {
          tenantId: scope.tenantId,
          userId: scope.userId,
          lockKind: "web-lock",
        })
        try {
          return { acquired: true, value: await callback() }
        } finally {
          transactionLog("processor_lock_released", {
            tenantId: scope.tenantId,
            userId: scope.userId,
            lockKind: "web-lock",
          })
        }
      })
    }

    return this.withIndexedDbLease(scope, callback)
  }

  private async withIndexedDbLease<T>(
    scope: TransactionScope,
    callback: () => Promise<T>
  ): Promise<LockResult<T>> {
    if (!(await this.acquireLease(scope))) return { acquired: false }
    transactionLog("processor_lock_acquired", {
      tenantId: scope.tenantId,
      userId: scope.userId,
      lockKind: "indexeddb-lease",
    })

    const heartbeat = setInterval(() => {
      void this.renewLease(scope)
    }, Math.max(1_000, TRANSACTION_POLICY.leaseRenewIntervalMs))

    try {
      return { acquired: true, value: await callback() }
    } finally {
      clearInterval(heartbeat)
      await this.releaseLease(scope)
      transactionLog("processor_lock_released", {
        tenantId: scope.tenantId,
        userId: scope.userId,
        lockKind: "indexeddb-lease",
      })
    }
  }

  private async acquireLease(scope: TransactionScope): Promise<boolean> {
    const db = await getTransactionDb()
    const tx = db.transaction("syncMetadata", "readwrite")
    const key = leaseKey(scope)
    const existing = await tx.store.get(key)
    const now = Date.now()
    if (existing?.ownerId && existing.ownerId !== this.ownerId && (existing.expiresAt ?? 0) > now) {
      await tx.done
      return false
    }
    await tx.store.put({
      key,
      scopeKey: scopeKey(scope.tenantId, scope.userId),
      name: "processor-lease",
      ownerId: this.ownerId,
      expiresAt: now + this.leaseDurationMs,
      updatedAt: now,
    })
    await tx.done
    return true
  }

  private async renewLease(scope: TransactionScope): Promise<void> {
    const db = await getTransactionDb()
    const tx = db.transaction("syncMetadata", "readwrite")
    const key = leaseKey(scope)
    const existing = await tx.store.get(key)
    if (existing?.ownerId === this.ownerId) {
      const now = Date.now()
      await tx.store.put({ ...existing, expiresAt: now + this.leaseDurationMs, updatedAt: now })
    }
    await tx.done
  }

  private async releaseLease(scope: TransactionScope): Promise<void> {
    const db = await getTransactionDb()
    const tx = db.transaction("syncMetadata", "readwrite")
    const key = leaseKey(scope)
    const existing = await tx.store.get(key)
    if (existing?.ownerId === this.ownerId) await tx.store.delete(key)
    await tx.done
  }

  private readonly handleBroadcastMessage = (event: MessageEvent<CoordinationMessage>) => {
    this.emit(event.data)
  }

  private readonly handleStorageMessage = (event: StorageEvent) => {
    if (event.key !== FALLBACK_STORAGE_KEY || !event.newValue) return
    try {
      const parsed = JSON.parse(event.newValue) as {
        channel: string
        message: CoordinationMessage
      }
      if (parsed.channel === this.channelName) this.emit(parsed.message)
    } catch {
      // Ignore malformed coordination messages.
    }
  }

  private readonly handleLocalMessage = (message: CoordinationMessage) => {
    if (message.sourceId !== this.ownerId) this.emit(message)
  }

  private emit(message: CoordinationMessage): void {
    if (!message || message.sourceId === this.ownerId) return
    for (const listener of this.listeners) listener(message)
  }
}

function leaseKey(scope: TransactionScope): string {
  return `${scopeKey(scope.tenantId, scope.userId)}:processor-lease`
}
