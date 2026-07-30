import type { ConnectivityService } from "@/lib/transactions/connectivity"
import type { TransactionCoordinator } from "@/lib/transactions/coordination"
import { transactionLog } from "@/lib/transactions/logger"
import type { TransactionQueue } from "@/lib/transactions/queue"
import type { TransactionHandlerRegistry } from "@/lib/transactions/registry"
import {
  classifyTransactionError,
  computeRetryDelayMs,
  resolveMaxAutomaticRetries,
  TransactionExecutionError,
} from "@/lib/transactions/retry"
import type { TransactionStatusStore } from "@/lib/transactions/status-store"
import type {
  ClassifiedTransactionError,
  StoredTransaction,
  TransactionHandler,
  TransactionScope,
  TransactionType,
} from "@/lib/transactions/types"
import { TRANSACTION_POLICY } from "@/lib/transactions/types"

export type ProcessorRunResult = {
  acquired: boolean
  processed: number
  succeeded: number
  retried: number
  conflicted: number
  failed: number
  blocked: number
  skippedAuthPause: boolean
}

const EMPTY_RESULT: Omit<ProcessorRunResult, "acquired"> = {
  processed: 0,
  succeeded: 0,
  retried: 0,
  conflicted: 0,
  failed: 0,
  blocked: 0,
  skippedAuthPause: false,
}

function createAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function resolveTimeoutMs(
  handler: TransactionHandler,
  transaction: StoredTransaction
): number {
  const configured = handler.executionTimeoutMs
  if (typeof configured === "function") return configured(transaction as never)
  if (typeof configured === "number" && configured > 0) return configured
  const payloadTimeout = (transaction.payload as { executionTimeoutMs?: number })
    ?.executionTimeoutMs
  if (typeof payloadTimeout === "number" && payloadTimeout > 0) return payloadTimeout
  return TRANSACTION_POLICY.executionTimeoutMs
}

function resolveRetryLimit(
  handler: TransactionHandler,
  transaction: StoredTransaction
): number {
  const configured = handler.maxAutomaticRetries
  if (typeof configured === "function") {
    return resolveMaxAutomaticRetries(configured(transaction as never))
  }
  if (typeof configured === "number") return resolveMaxAutomaticRetries(configured)
  const payloadLimit = (transaction.payload as { maxAutomaticRetries?: number })
    ?.maxAutomaticRetries
  return resolveMaxAutomaticRetries(payloadLimit)
}

export class TransactionProcessor {
  constructor(
    private readonly queue: TransactionQueue,
    private readonly registry: TransactionHandlerRegistry,
    private readonly connectivity: ConnectivityService,
    private readonly statusStore: TransactionStatusStore,
    private readonly coordinator: TransactionCoordinator
  ) {}

  async process(scope: TransactionScope): Promise<ProcessorRunResult> {
    if (this.statusStore.getStatus().authenticationPaused) {
      return { acquired: false, ...EMPTY_RESULT, skippedAuthPause: true }
    }
    if (this.connectivity.getState() !== "online") {
      return { acquired: false, ...EMPTY_RESULT }
    }

    const locked = await this.coordinator.withProcessorLock(scope, async () => {
      const result = { ...EMPTY_RESULT }
      this.statusStore.setSyncState("syncing")
      transactionLog("sync_started", { tenantId: scope.tenantId, userId: scope.userId })

      try {
        await this.recoverInterruptedTransactions(scope)
        for (const transaction of await this.queue.listEligible(scope)) {
          if (this.statusStore.getStatus().authenticationPaused) {
            result.skippedAuthPause = true
            break
          }
          const dependencyState = await this.checkDependencies(transaction)
          if (dependencyState === "waiting") continue
          if (dependencyState === "blocked") {
            result.blocked++
            continue
          }
          if (this.connectivity.getState() !== "online") break
          await this.processOne(transaction, result)
          if (this.statusStore.getStatus().authenticationPaused) {
            result.skippedAuthPause = true
            break
          }
        }

        const counts = await this.queue.getCounts(scope)
        if (
          result.processed > 0 &&
          counts.pending === 0 &&
          counts.processing === 0 &&
          counts.retrying === 0 &&
          counts.blocked === 0 &&
          counts.conflict === 0 &&
          counts.permanently_failed === 0
        ) {
          await this.statusStore.markSyncComplete()
        }
        return result
      } finally {
        await this.statusStore.refreshCounts()
        if (!this.statusStore.getStatus().authenticationPaused) {
          this.statusStore.setSyncState("idle")
        }
        this.coordinator.broadcast({ type: "sync-completed", scope })
      }
    })

    return locked.acquired
      ? { acquired: true, ...(locked.value ?? EMPTY_RESULT) }
      : { acquired: false, ...EMPTY_RESULT }
  }

  private async processOne(
    transaction: StoredTransaction,
    result: Omit<ProcessorRunResult, "acquired">
  ): Promise<void> {
    result.processed++
    const processingAttemptId = createAttemptId()
    const attemptedAt = Date.now()
    const claimed = await this.queue.updateIf(
      transaction.id,
      (current) => current.status === "pending" || current.status === "retrying",
      {
        status: "processing",
        lastAttemptAt: attemptedAt,
        nextRetryAt: null,
        blockedReason: null,
        processingAttemptId,
      }
    )
    if (!claimed) return

    await this.statusStore.refreshCounts()
    transactionLog("execution_attempted", {
      transactionId: claimed.id,
      type: claimed.type,
      retryCount: claimed.retryCount,
    })

    const handler = this.registry.get(claimed.type)
    const timeoutMs = resolveTimeoutMs(handler, claimed)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const executionResult = await handler.execute({
        transaction: claimed,
        signal: controller.signal,
        attempt: claimed.retryCount + 1,
        scope: { tenantId: claimed.tenantId, userId: claimed.userId },
        processingAttemptId,
      })

      if (controller.signal.aborted) {
        throw new TransactionExecutionError({
          kind: "retriable",
          code: "TIMEOUT",
          message: "Transaction execution timed out",
        })
      }

      const stillOwner = await this.queue.updateIf(
        claimed.id,
        (current) =>
          current.status === "processing" &&
          current.processingAttemptId === processingAttemptId,
        {
          status: "succeeded",
          resultMetadata: executionResult.resultMetadata ?? null,
          lastErrorCode: null,
          lastErrorMessage: null,
          processingAttemptId: null,
        }
      )

      if (!stillOwner) {
        // Late completion after timeout/lease takeover — ignore.
        return
      }

      await handler.reconcile?.(claimed, executionResult)
      result.succeeded++
      this.connectivity.reportRequestSuccess()
      transactionLog("transaction_succeeded", {
        transactionId: claimed.id,
        type: claimed.type,
      })
      await this.reevaluateDependents(claimed)
    } catch (error) {
      if (controller.signal.aborted && !(error instanceof TransactionExecutionError)) {
        error = new TransactionExecutionError({
          kind: "retriable",
          code: "TIMEOUT",
          message: "Transaction execution timed out",
        })
      }
      const classified = handler.classifyError?.(error) ?? classifyTransactionError(error)
      await this.handleFailure(claimed, processingAttemptId, handler, classified, result)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async handleFailure(
    transaction: StoredTransaction,
    processingAttemptId: string,
    handler: TransactionHandler,
    error: ClassifiedTransactionError,
    result: Omit<ProcessorRunResult, "acquired">
  ): Promise<void> {
    const ownsAttempt = (current: StoredTransaction) =>
      current.status === "processing" && current.processingAttemptId === processingAttemptId

    if (error.kind === "retriable") {
      const retryCount = transaction.retryCount + 1
      const maxRetries = resolveRetryLimit(handler, transaction)
      if (retryCount > maxRetries) {
        const updated = await this.queue.updateIf(transaction.id, ownsAttempt, {
          status: "permanently_failed",
          retryCount,
          nextRetryAt: null,
          lastErrorCode: "RETRY_EXHAUSTED",
          lastErrorMessage: `Automatic retries exhausted after ${maxRetries} attempts: ${error.message}`,
          processingAttemptId: null,
        })
        if (updated) {
          result.failed++
          transactionLog("permanent_failure", {
            transactionId: transaction.id,
            type: transaction.type,
            errorCode: "RETRY_EXHAUSTED",
          })
          await this.reevaluateDependents(updated)
        }
        return
      }

      const updated = await this.queue.updateIf(transaction.id, ownsAttempt, {
        status: "retrying",
        retryCount,
        nextRetryAt: Date.now() + computeRetryDelayMs(retryCount, error.retryAfterMs),
        lastErrorCode: error.code,
        lastErrorMessage: error.message,
        processingAttemptId: null,
      })
      if (!updated) return
      result.retried++
      this.connectivity.reportRequestFailure(new TypeError(error.message))
      transactionLog("transaction_retried", {
        transactionId: transaction.id,
        type: transaction.type,
        retryCount,
        errorCode: error.code,
      })
      return
    }

    if (error.kind === "authentication") {
      const updated = await this.queue.updateIf(transaction.id, ownsAttempt, {
        status: "pending",
        lastErrorCode: error.code,
        lastErrorMessage: error.message,
        processingAttemptId: null,
        authFailureCount: transaction.authFailureCount + 1,
      })
      if (updated) {
        await this.statusStore.persistAuthenticationPaused(true)
      }
      return
    }

    if (error.kind === "conflict") {
      const updated = await this.queue.updateIf(transaction.id, ownsAttempt, {
        status: "conflict",
        lastErrorCode: error.code,
        lastErrorMessage: error.message,
        resultMetadata: error.conflictMetadata ?? null,
        processingAttemptId: null,
      })
      if (updated) {
        result.conflicted++
        transactionLog("conflict_created", {
          transactionId: transaction.id,
          type: transaction.type,
          errorCode: error.code,
        })
        await this.reevaluateDependents(updated)
      }
      return
    }

    const updated = await this.queue.updateIf(transaction.id, ownsAttempt, {
      status: "permanently_failed",
      lastErrorCode: error.code,
      lastErrorMessage: error.message,
      processingAttemptId: null,
    })
    if (updated) {
      result.failed++
      transactionLog("permanent_failure", {
        transactionId: transaction.id,
        type: transaction.type,
        errorCode: error.code,
      })
      await this.reevaluateDependents(updated)
    }
  }

  private async checkDependencies(
    transaction: StoredTransaction
  ): Promise<"ready" | "waiting" | "blocked"> {
    if (transaction.dependsOn.length === 0) return "ready"
    const dependencies = await this.queue.getDependencies(transaction)
    if (dependencies.length !== transaction.dependsOn.length) {
      await this.block(transaction, "A required transaction is missing")
      return "blocked"
    }
    if (dependencies.every((dependency) => dependency.status === "succeeded")) return "ready"
    if (
      dependencies.some((dependency) =>
        ["conflict", "permanently_failed", "discarded"].includes(dependency.status)
      )
    ) {
      await this.block(transaction, "A required transaction could not be applied")
      return "blocked"
    }
    return "waiting"
  }

  private async block(transaction: StoredTransaction, reason: string): Promise<void> {
    if (transaction.status === "blocked" && transaction.blockedReason === reason) return
    const updated = await this.queue.updateIf(
      transaction.id,
      (current) => current.id === transaction.id,
      { status: "blocked", blockedReason: reason }
    )
    if (!updated) return
    transactionLog("dependency_blocked", {
      transactionId: transaction.id,
      type: transaction.type,
    })
  }

  /**
   * Reevaluate dependents after a parent reaches a terminal or soft-terminal state.
   * Blocked children become pending only when all dependencies are succeeded.
   */
  async reevaluateDependents(parent: StoredTransaction): Promise<void> {
    const scope = { tenantId: parent.tenantId, userId: parent.userId }
    const dependents = await this.queue.listDependents(scope, parent.id)

    for (const child of dependents) {
      if (child.status !== "blocked" && child.status !== "pending" && child.status !== "retrying") {
        continue
      }

      const dependencies = await this.queue.getDependencies(child)
      const missing = dependencies.length !== child.dependsOn.length
      const failedParent = dependencies.some((dependency) =>
        ["conflict", "permanently_failed", "discarded"].includes(dependency.status)
      )
      const allSucceeded =
        !missing && dependencies.every((dependency) => dependency.status === "succeeded")

      if (allSucceeded && child.status === "blocked") {
        await this.queue.update(child.id, {
          status: "pending",
          blockedReason: null,
          nextRetryAt: null,
        })
        continue
      }

      if (failedParent) {
        const discardedParent = dependencies.find((dependency) => dependency.status === "discarded")
        if (discardedParent) {
          const handler = this.registry.has(child.type)
            ? this.registry.get(child.type as TransactionType)
            : null
          if (handler?.discardWithParent) {
            await this.queue.update(child.id, {
              status: "discarded",
              discardedAt: Date.now(),
              discardReason: `Parent ${discardedParent.id} was discarded`,
              resolution: "discard",
              blockedReason: null,
              processingAttemptId: null,
              nextRetryAt: null,
            })
            continue
          }
        }
        if (child.status !== "blocked") {
          await this.block(child, "A required transaction could not be applied")
        }
      }
    }

    this.coordinator.broadcast({ type: "status-changed", scope })
  }

  private async recoverInterruptedTransactions(scope: TransactionScope): Promise<void> {
    const staleBefore = Date.now() - TRANSACTION_POLICY.staleProcessingMs
    for (const transaction of await this.queue.listForScope(scope)) {
      if (
        transaction.status === "processing" &&
        (transaction.lastAttemptAt == null || transaction.lastAttemptAt < staleBefore)
      ) {
        await this.queue.update(transaction.id, {
          status: "retrying",
          nextRetryAt: Date.now(),
          lastErrorCode: "INTERRUPTED",
          lastErrorMessage: "Previous processing attempt was interrupted",
          processingAttemptId: null,
        })
      }
    }
  }
}
