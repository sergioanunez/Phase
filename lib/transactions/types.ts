export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type TransactionPayloadMap = {
  NO_OP_TEST: {
    value?: JsonValue
    failAttempts?: number
    failureKind?: "network" | "server" | "validation" | "conflict" | "auth"
    delayMs?: number
    hangForever?: boolean
    executionTimeoutMs?: number
    maxAutomaticRetries?: number
  }
  PUNCH_ITEM_CREATE: {
    clientPunchItemId: string
    homeTaskId: string
    homeId?: string | null
    title: string
    description?: string | null
    assignedContractorId?: string | null
    /** Display-only; not sent to server */
    assignedContractorName?: string | null
    dueDate?: string | null
    deviceCreatedAt: string
    source?: string
  }
}

export type TransactionType = keyof TransactionPayloadMap

export type TransactionStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "blocked"
  | "conflict"
  | "succeeded"
  | "permanently_failed"
  | "discarded"

export type ConnectivityState = "online" | "offline" | "degraded" | "checking"
export type SyncState = "idle" | "syncing" | "paused"

export type TransactionScope = {
  tenantId: string
  userId: string
}

/** Application-facing dispatch input. Scope is injected by TransactionEngine. */
export type TransactionDispatchInput<T extends TransactionType = TransactionType> = {
  type: T
  houseId?: string | null
  entityId?: string | null
  payload: TransactionPayloadMap[T]
  priority?: number
  baseVersion?: number | null
  baseUpdatedAt?: string | null
  dependsOn?: string[]
}

/** @deprecated Internal only — prefer TransactionDispatchInput for app code. */
export type TransactionDraft<T extends TransactionType = TransactionType> =
  TransactionDispatchInput<T> & {
    scope: TransactionScope
  }

export type DispatchResultStatus = "queued" | "processing" | "succeeded"

export type TransactionDispatchResult = {
  transactionId: string
  status: DispatchResultStatus
  optimisticApplied: boolean
}

export type ConflictResolutionIntent = "keep_server" | "apply_local" | "discard_local"

export type ConflictResolutionInput = {
  intent: ConflictResolutionIntent
  note?: string
}

export type StoredTransaction<T extends TransactionType = TransactionType> = {
  id: string
  idempotencyKey: string
  type: T
  tenantId: string
  userId: string
  houseId: string | null
  entityId: string | null
  payload: TransactionPayloadMap[T]
  createdAt: number
  updatedAt: number
  status: TransactionStatus
  priority: number
  retryCount: number
  nextRetryAt: number | null
  lastAttemptAt: number | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  baseVersion: number | null
  baseUpdatedAt: string | null
  dependsOn: string[]
  blockedReason: string | null
  resultMetadata: JsonValue | null
  processingAttemptId: string | null
  discardedAt: number | null
  discardReason: string | null
  resolution: ConflictResolutionIntent | "discard" | null
  authFailureCount: number
}

export type TransactionExecutionContext = {
  transaction: StoredTransaction
  signal: AbortSignal
  attempt: number
  scope: TransactionScope
  processingAttemptId: string
}

export type TransactionExecutionResult = {
  status: "applied" | "noop"
  resultMetadata?: JsonValue
}

export type TransactionErrorKind =
  | "retriable"
  | "conflict"
  | "permanent"
  | "authentication"

export type ClassifiedTransactionError = {
  kind: TransactionErrorKind
  code: string
  message: string
  retryAfterMs?: number
  conflictMetadata?: JsonValue
}

export type ConflictResolveContext = {
  transaction: StoredTransaction
  intent: ConflictResolutionIntent
  note?: string
}

export type ConflictResolveResult =
  | {
      action: "resolved_noop"
      resultMetadata?: JsonValue
    }
  | {
      action: "rebase"
      payload?: JsonValue
      baseVersion?: number | null
      baseUpdatedAt?: string | null
      resultMetadata?: JsonValue
    }
  | {
      action: "discard"
      resultMetadata?: JsonValue
    }

export type TransactionHandler<T extends TransactionType = TransactionType> = {
  type: T
  validate(payload: TransactionPayloadMap[T]): void
  execute(context: TransactionExecutionContext): Promise<TransactionExecutionResult>
  applyOptimistic?(transaction: StoredTransaction<T>): void | Promise<void>
  reconcile?(
    transaction: StoredTransaction<T>,
    result: TransactionExecutionResult
  ): void | Promise<void>
  classifyError?(error: unknown): ClassifiedTransactionError
  executionTimeoutMs?: number | ((transaction: StoredTransaction<T>) => number)
  maxAutomaticRetries?: number | ((transaction: StoredTransaction<T>) => number)
  resolveConflict?(context: ConflictResolveContext): Promise<ConflictResolveResult>
  discardOptimistic?(transaction: StoredTransaction<T>): void | Promise<void>
  /** When true, discarding a parent may discard this dependent instead of blocking. */
  discardWithParent?: boolean
}

export type AggregateTransactionStatus = {
  connectivity: ConnectivityState
  syncState: SyncState
  authenticationPaused: boolean
  pendingCount: number
  processingCount: number
  conflictCount: number
  failedCount: number
  blockedCount: number
  lastSuccessfulSyncAt: string | null
}

export type CoordinationMessage =
  | { type: "queue-changed"; scope: TransactionScope; sourceId: string }
  | { type: "sync-completed"; scope: TransactionScope; sourceId: string }
  | { type: "status-changed"; scope: TransactionScope; sourceId: string }

export class TransactionEngineError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "TransactionEngineError"
    this.code = code
  }
}

/** Policy constants — see docs/architecture/transaction-engine.md */
export const TRANSACTION_POLICY = {
  /** Default handler execution timeout. Shorter than stale-processing recovery. */
  executionTimeoutMs: 30_000,
  /** IndexedDB lease duration when Web Locks are unavailable. */
  leaseDurationMs: 60_000,
  /** Lease renewal interval (IndexedDB path). */
  leaseRenewIntervalMs: 20_000,
  /** Recover `processing` rows abandoned without a clean release. */
  staleProcessingMs: 90_000,
  /** Automatic transient retries before permanently_failed. */
  maxAutomaticRetries: 8,
  /** Coalesce near-simultaneous sync triggers. */
  syncDebounceMs: 50,
} as const
