import { ConnectivityService } from "@/lib/transactions/connectivity"
import { TransactionCoordinator } from "@/lib/transactions/coordination"
import { TransactionProcessor, type ProcessorRunResult } from "@/lib/transactions/processor"
import { TransactionQueue } from "@/lib/transactions/queue"
import { TransactionHandlerRegistry } from "@/lib/transactions/registry"
import { TransactionStatusStore } from "@/lib/transactions/status-store"
import type {
  AggregateTransactionStatus,
  ConflictResolutionInput,
  ConflictResolutionIntent,
  StoredTransaction,
  TransactionDispatchInput,
  TransactionDispatchResult,
  TransactionHandler,
  TransactionScope,
  TransactionType,
} from "@/lib/transactions/types"
import { TRANSACTION_POLICY, TransactionEngineError } from "@/lib/transactions/types"

export type TransactionEngineOptions = {
  /** Test-only overrides. Application code must not depend on these. */
  connectivity?: ConnectivityService
  coordinator?: TransactionCoordinator
  syncDebounceMs?: number
  now?: () => number
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

type PendingSync = {
  resolve: (result: ProcessorRunResult) => void
  reject: (error: unknown) => void
}

/**
 * Application-facing Transaction Engine.
 * Internals (queue, processor, connectivity, coordination) are private.
 */
export class TransactionEngine {
  private readonly registry = new TransactionHandlerRegistry()
  private readonly connectivity: ConnectivityService
  private readonly coordinator: TransactionCoordinator
  private readonly queue: TransactionQueue
  private readonly statusStore: TransactionStatusStore
  private readonly processor: TransactionProcessor

  private initialized = false
  private unsubscribeConnectivity: (() => void) | null = null
  private unsubscribeCoordination: (() => void) | null = null
  private retryWakeTimer: ReturnType<typeof setTimeout> | null = null
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingSyncWaiters: PendingSync[] = []
  private syncInFlight: Promise<ProcessorRunResult> | null = null
  private readonly syncDebounceMs: number
  private readonly now: () => number
  private readonly setTimeoutFn: typeof setTimeout
  private readonly clearTimeoutFn: typeof clearTimeout

  constructor(
    readonly scope: TransactionScope,
    options: TransactionEngineOptions = {}
  ) {
    this.connectivity = options.connectivity ?? new ConnectivityService()
    this.coordinator = options.coordinator ?? new TransactionCoordinator()
    this.syncDebounceMs = options.syncDebounceMs ?? TRANSACTION_POLICY.syncDebounceMs
    this.now = options.now ?? Date.now
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout
    this.queue = new TransactionQueue(async (changedScope) => {
      if (sameScope(changedScope, this.scope)) {
        await this.statusStore.refreshCounts()
        this.scheduleRetryWake()
      }
      this.coordinator.broadcast({ type: "queue-changed", scope: changedScope })
    })
    this.statusStore = new TransactionStatusStore(this.queue, scope)
    this.processor = new TransactionProcessor(
      this.queue,
      this.registry,
      this.connectivity,
      this.statusStore,
      this.coordinator
    )
  }

  /** Registers a handler. Intended for engine bootstrap / test utilities. */
  registerHandler<T extends TransactionType>(handler: TransactionHandler<T>): void {
    this.registry.register(handler)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    if (process.env.NODE_ENV !== "production") {
      const { noOpTestTransactionHandler } = await import(
        "@/lib/transactions/handlers/no-op-test"
      )
      if (!this.registry.has("NO_OP_TEST")) {
        this.registry.register(noOpTestTransactionHandler)
      }
    }

    this.coordinator.start()
    this.unsubscribeCoordination = this.coordinator.subscribe((message) => {
      if (!sameScope(message.scope, this.scope)) return
      void this.statusStore.refreshCounts()
      this.scheduleRetryWake()
      if (
        message.type === "queue-changed" &&
        this.connectivity.getState() === "online" &&
        !this.statusStore.getStatus().authenticationPaused
      ) {
        void this.requestSync()
      }
    })
    this.unsubscribeConnectivity = this.connectivity.subscribe((state) => {
      this.statusStore.setConnectivity(state)
      if (state === "online") {
        this.scheduleRetryWake()
        if (!this.statusStore.getStatus().authenticationPaused) {
          void this.requestSync()
        }
      }
    })
    await this.statusStore.initialize()
    this.connectivity.start()
    this.scheduleRetryWake()
  }

  async dispatch<T extends TransactionType>(
    input: TransactionDispatchInput<T>
  ): Promise<TransactionDispatchResult> {
    this.assertInitialized()
    if ("scope" in (input as object)) {
      throw new TransactionEngineError(
        "SCOPE_OVERRIDE_FORBIDDEN",
        "Dispatch cannot override the engine tenant/user scope"
      )
    }

    const handler = this.registry.get(input.type)
    handler.validate(input.payload)
    const transaction = await this.queue.enqueue({
      ...input,
      scope: this.scope,
    })
    let optimisticApplied = false
    if (handler.applyOptimistic) {
      await handler.applyOptimistic(transaction)
      optimisticApplied = true
    }

    if (
      this.connectivity.getState() === "online" &&
      !this.statusStore.getStatus().authenticationPaused
    ) {
      void this.requestSync()
    }

    return {
      transactionId: transaction.id,
      status: "queued",
      optimisticApplied,
    }
  }

  /** Explicit sync. Coalesces with near-simultaneous triggers via debounce. */
  sync(): Promise<ProcessorRunResult> {
    return this.requestSync({ immediate: true })
  }

  async retry(transactionId: string): Promise<void> {
    this.assertInitialized()
    const transaction = await this.requireScopedTransaction(transactionId)
    if (transaction.status === "processing") {
      throw new TransactionEngineError(
        "RETRY_WHILE_PROCESSING",
        "Cannot retry a transaction that is currently processing"
      )
    }
    if (transaction.status === "discarded") {
      throw new TransactionEngineError(
        "RETRY_DISCARDED",
        "Cannot retry a discarded transaction"
      )
    }
    await this.queue.update(transactionId, {
      status: "pending",
      nextRetryAt: null,
      blockedReason: null,
      retryCount: 0,
      processingAttemptId: null,
      resolution: null,
    })
    this.scheduleRetryWake()
    if (
      this.connectivity.getState() === "online" &&
      !this.statusStore.getStatus().authenticationPaused
    ) {
      void this.requestSync()
    }
  }

  async resolveConflict(
    transactionId: string,
    resolution: ConflictResolutionInput
  ): Promise<void> {
    this.assertInitialized()
    const transaction = await this.requireScopedTransaction(transactionId)
    if (transaction.status !== "conflict") {
      throw new TransactionEngineError(
        "NOT_IN_CONFLICT",
        "Only conflicted transactions can be resolved through resolveConflict"
      )
    }

    const handler = this.registry.get(transaction.type)
    if (!handler.resolveConflict) {
      throw new TransactionEngineError(
        "UNSUPPORTED_RESOLUTION",
        `Handler ${transaction.type} does not support conflict resolution`
      )
    }

    const result = await handler.resolveConflict({
      transaction,
      intent: resolution.intent,
      note: resolution.note,
    })

    if (result.action === "resolved_noop" || resolution.intent === "keep_server") {
      if (handler.discardOptimistic) await handler.discardOptimistic(transaction)
      await this.queue.update(transactionId, {
        status: "succeeded",
        resolution: resolution.intent,
        resultMetadata: {
          ...(asObject(transaction.resultMetadata) ?? {}),
          ...(asObject(result.resultMetadata) ?? {}),
          resolvedAs: "keep_server_noop",
        },
        processingAttemptId: null,
        blockedReason: null,
        nextRetryAt: null,
      })
      await this.processor.reevaluateDependents({
        ...(await this.queue.get(transactionId))!,
      })
      this.scheduleRetryWake()
      return
    }

    if (result.action === "discard" || resolution.intent === "discard_local") {
      await this.discardInternal(transaction, "Conflict discarded locally", "discard_local")
      return
    }

    if (result.action === "rebase" || resolution.intent === "apply_local") {
      await this.queue.update(transactionId, {
        status: "pending",
        payload: (result.payload as StoredTransaction["payload"]) ?? transaction.payload,
        baseVersion: result.baseVersion ?? transaction.baseVersion,
        baseUpdatedAt: result.baseUpdatedAt ?? transaction.baseUpdatedAt,
        retryCount: 0,
        nextRetryAt: null,
        blockedReason: null,
        processingAttemptId: null,
        resolution: "apply_local",
        resultMetadata: result.resultMetadata ?? transaction.resultMetadata,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      this.scheduleRetryWake()
      if (
        this.connectivity.getState() === "online" &&
        !this.statusStore.getStatus().authenticationPaused
      ) {
        void this.requestSync()
      }
      return
    }

    throw new TransactionEngineError(
      "UNSUPPORTED_RESOLUTION",
      `Unsupported conflict resolution intent: ${resolution.intent}`
    )
  }

  async discard(transactionId: string, reason: string): Promise<void> {
    this.assertInitialized()
    const transaction = await this.requireScopedTransaction(transactionId)
    await this.discardInternal(transaction, reason, "discard")
  }

  async resumeAfterAuthentication(session: TransactionScope): Promise<void> {
    this.assertInitialized()
    if (!sameScope(session, this.scope)) {
      throw new TransactionEngineError(
        "SCOPE_MISMATCH",
        "Cannot resume authentication for a different tenant/user scope"
      )
    }
    await this.statusStore.persistAuthenticationPaused(false)
    this.scheduleRetryWake()
    if (this.connectivity.getState() === "online") {
      await this.requestSync({ immediate: true })
    }
  }

  getStatus(): AggregateTransactionStatus {
    return this.statusStore.getStatus()
  }

  subscribe(listener: (status: AggregateTransactionStatus) => void): () => void {
    return this.statusStore.subscribe(listener)
  }

  stop(): void {
    this.clearRetryWake()
    if (this.syncDebounceTimer != null) {
      this.clearTimeoutFn(this.syncDebounceTimer)
      this.syncDebounceTimer = null
    }
    this.unsubscribeConnectivity?.()
    this.unsubscribeCoordination?.()
    this.connectivity.stop()
    this.coordinator.stop()
    this.initialized = false
  }

  /** Test/diagnostics only — not part of the public application API. */
  async __unsafeGetStoredTransaction(id: string): Promise<StoredTransaction | undefined> {
    return this.queue.get(id)
  }

  /** Test-only: expose queue listing for assertions. */
  async __unsafeListStoredTransactions(): Promise<StoredTransaction[]> {
    return this.queue.listForScope(this.scope)
  }

  private async discardInternal(
    transaction: StoredTransaction,
    reason: string,
    resolution: ConflictResolutionIntent | "discard"
  ): Promise<void> {
    if (transaction.status === "succeeded" || transaction.status === "discarded") {
      throw new TransactionEngineError(
        "DISCARD_INVALID_STATUS",
        `Cannot discard a transaction in status ${transaction.status}`
      )
    }
    if (transaction.status === "processing") {
      const cancelled = await this.queue.updateIf(
        transaction.id,
        (current) => current.status === "processing",
        {
          status: "discarded",
          discardedAt: this.now(),
          discardReason: reason,
          resolution,
          processingAttemptId: null,
          nextRetryAt: null,
          blockedReason: null,
        }
      )
      if (!cancelled) {
        throw new TransactionEngineError(
          "DISCARD_RACE",
          "Transaction left processing before discard could complete"
        )
      }
    } else {
      await this.queue.update(transaction.id, {
        status: "discarded",
        discardedAt: this.now(),
        discardReason: reason,
        resolution,
        processingAttemptId: null,
        nextRetryAt: null,
        blockedReason: null,
      })
    }

    const handler = this.registry.get(transaction.type)
    await handler.discardOptimistic?.(transaction)
    const discarded = (await this.queue.get(transaction.id))!
    await this.processor.reevaluateDependents(discarded)
    this.scheduleRetryWake()
  }

  private requestSync(options?: { immediate?: boolean }): Promise<ProcessorRunResult> {
    this.assertInitialized()
    return new Promise<ProcessorRunResult>((resolve, reject) => {
      this.pendingSyncWaiters.push({ resolve, reject })
      if (options?.immediate) {
        if (this.syncDebounceTimer != null) {
          this.clearTimeoutFn(this.syncDebounceTimer)
          this.syncDebounceTimer = null
        }
        void this.flushSync()
        return
      }
      if (this.syncDebounceTimer != null) return
      this.syncDebounceTimer = this.setTimeoutFn(() => {
        this.syncDebounceTimer = null
        void this.flushSync()
      }, this.syncDebounceMs)
    })
  }

  private async flushSync(): Promise<void> {
    if (this.syncInFlight) {
      try {
        const result = await this.syncInFlight
        this.resolveWaiters(result)
      } catch (error) {
        this.rejectWaiters(error)
      }
      return
    }

    if (
      this.connectivity.getState() === "degraded" ||
      this.connectivity.getState() === "checking"
    ) {
      await this.connectivity.check()
    }

    this.syncInFlight = this.processor.process(this.scope)
    try {
      const result = await this.syncInFlight
      this.resolveWaiters(result)
      this.scheduleRetryWake()
    } catch (error) {
      this.rejectWaiters(error)
    } finally {
      this.syncInFlight = null
    }
  }

  private resolveWaiters(result: ProcessorRunResult): void {
    const waiters = this.pendingSyncWaiters
    this.pendingSyncWaiters = []
    for (const waiter of waiters) waiter.resolve(result)
  }

  private rejectWaiters(error: unknown): void {
    const waiters = this.pendingSyncWaiters
    this.pendingSyncWaiters = []
    for (const waiter of waiters) waiter.reject(error)
  }

  private scheduleRetryWake(): void {
    this.clearRetryWake()
    if (!this.initialized) return
    void this.queue.getEarliestFutureRetryAt(this.scope, this.now()).then((nextAt) => {
      if (nextAt == null || !this.initialized) return
      const delay = Math.max(0, nextAt - this.now())
      this.retryWakeTimer = this.setTimeoutFn(() => {
        this.retryWakeTimer = null
        void this.onRetryWake()
      }, delay)
    })
  }

  private async onRetryWake(): Promise<void> {
    if (!this.initialized) return
    if (this.statusStore.getStatus().authenticationPaused) {
      this.scheduleRetryWake()
      return
    }
    if (this.connectivity.getState() === "offline") {
      // Do not spin while offline; reconnect path will reschedule.
      return
    }
    // Retriable failures may mark connectivity degraded; re-check before syncing.
    if (this.connectivity.getState() !== "online") {
      await this.connectivity.check()
    }
    if (this.connectivity.getState() !== "online") {
      this.scheduleRetryWake()
      return
    }
    await this.requestSync({ immediate: true })
    this.scheduleRetryWake()
  }

  private clearRetryWake(): void {
    if (this.retryWakeTimer != null) {
      this.clearTimeoutFn(this.retryWakeTimer)
      this.retryWakeTimer = null
    }
  }

  private async requireScopedTransaction(id: string): Promise<StoredTransaction> {
    const transaction = await this.queue.get(id)
    if (!transaction || !sameScope(transaction, this.scope)) {
      throw new TransactionEngineError(
        "NOT_FOUND",
        "Transaction not found for the active scope"
      )
    }
    return transaction
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new TransactionEngineError(
        "NOT_INITIALIZED",
        "TransactionEngine.initialize() must be called first"
      )
    }
  }
}

function sameScope(
  left: TransactionScope | { tenantId: string; userId: string },
  right: TransactionScope
): boolean {
  return left.tenantId === right.tenantId && left.userId === right.userId
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}
