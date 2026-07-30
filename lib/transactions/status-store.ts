import type { TransactionQueue } from "@/lib/transactions/queue"
import type {
  AggregateTransactionStatus,
  ConnectivityState,
  SyncState,
  TransactionScope,
} from "@/lib/transactions/types"
import { getTransactionDb, scopeKey } from "@/lib/transactions/db"

type StatusListener = (status: AggregateTransactionStatus) => void

const INITIAL_STATUS: AggregateTransactionStatus = {
  connectivity: "checking",
  syncState: "idle",
  authenticationPaused: false,
  pendingCount: 0,
  processingCount: 0,
  conflictCount: 0,
  failedCount: 0,
  blockedCount: 0,
  lastSuccessfulSyncAt: null,
}

export class TransactionStatusStore {
  private status: AggregateTransactionStatus = { ...INITIAL_STATUS }
  private readonly listeners = new Set<StatusListener>()

  constructor(
    private readonly queue: TransactionQueue,
    private readonly scope: TransactionScope
  ) {}

  getStatus(): AggregateTransactionStatus {
    return { ...this.status }
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener)
    listener(this.getStatus())
    return () => this.listeners.delete(listener)
  }

  setConnectivity(connectivity: ConnectivityState): void {
    this.set({ connectivity })
  }

  setSyncState(syncState: SyncState): void {
    this.set({ syncState })
  }

  setAuthenticationPaused(authenticationPaused: boolean): void {
    this.set({
      authenticationPaused,
      syncState: authenticationPaused ? "paused" : this.status.syncState === "paused" ? "idle" : this.status.syncState,
    })
  }

  async initialize(): Promise<void> {
    const key = `${scopeKey(this.scope.tenantId, this.scope.userId)}:last-successful-sync`
    const metadata = await (await getTransactionDb()).get("syncMetadata", key)
    if (typeof metadata?.value === "string") {
      this.status.lastSuccessfulSyncAt = metadata.value
    }
    const pauseKey = `${scopeKey(this.scope.tenantId, this.scope.userId)}:auth-paused`
    const pause = await (await getTransactionDb()).get("syncMetadata", pauseKey)
    if (pause?.value === true) {
      this.status.authenticationPaused = true
      this.status.syncState = "paused"
    }
    await this.refreshCounts()
  }

  async persistAuthenticationPaused(paused: boolean): Promise<void> {
    const scope = scopeKey(this.scope.tenantId, this.scope.userId)
    await (await getTransactionDb()).put("syncMetadata", {
      key: `${scope}:auth-paused`,
      scopeKey: scope,
      name: "auth-paused",
      value: paused,
      updatedAt: Date.now(),
    })
    this.setAuthenticationPaused(paused)
  }

  async refreshCounts(): Promise<void> {
    const counts = await this.queue.getCounts(this.scope)
    this.set({
      pendingCount: counts.pending + counts.retrying,
      processingCount: counts.processing,
      conflictCount: counts.conflict,
      failedCount: counts.permanently_failed,
      blockedCount: counts.blocked,
    })
  }

  async markSyncComplete(): Promise<void> {
    const timestamp = new Date().toISOString()
    const scope = scopeKey(this.scope.tenantId, this.scope.userId)
    await (await getTransactionDb()).put("syncMetadata", {
      key: `${scope}:last-successful-sync`,
      scopeKey: scope,
      name: "last-successful-sync",
      value: timestamp,
      updatedAt: Date.now(),
    })
    this.set({ lastSuccessfulSyncAt: timestamp })
  }

  private set(patch: Partial<AggregateTransactionStatus>): void {
    this.status = { ...this.status, ...patch }
    const snapshot = this.getStatus()
    for (const listener of this.listeners) listener(snapshot)
  }
}
