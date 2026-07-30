/**
 * Test-only utilities. Do not import from application code.
 */
import { ConnectivityService } from "@/lib/transactions/connectivity"
import { TransactionCoordinator } from "@/lib/transactions/coordination"
import {
  closeTransactionDb,
  getTransactionDb,
  resetTransactionDatabaseForTests,
} from "@/lib/transactions/db"
import { TransactionEngine, type TransactionEngineOptions } from "@/lib/transactions/engine"
import { noOpTestTransactionHandler } from "@/lib/transactions/handlers/no-op-test"
import { TransactionProcessor } from "@/lib/transactions/processor"
import { TransactionQueue } from "@/lib/transactions/queue"
import { TransactionHandlerRegistry } from "@/lib/transactions/registry"
import {
  TransactionExecutionError,
  classifyTransactionError,
  computeRetryDelayMs,
} from "@/lib/transactions/retry"
import { TransactionStatusStore } from "@/lib/transactions/status-store"
import type { TransactionScope } from "@/lib/transactions/types"

export {
  classifyTransactionError,
  closeTransactionDb,
  computeRetryDelayMs,
  ConnectivityService,
  getTransactionDb,
  noOpTestTransactionHandler,
  resetTransactionDatabaseForTests,
  TransactionCoordinator,
  TransactionExecutionError,
  TransactionHandlerRegistry,
  TransactionProcessor,
  TransactionQueue,
  TransactionStatusStore,
}

export async function createTestEngine(
  scope: TransactionScope,
  options: TransactionEngineOptions = {}
): Promise<TransactionEngine> {
  const connectivity = options.connectivity ?? new ConnectivityService(async () => true)
  connectivity.reportRequestSuccess()
  const engine = new TransactionEngine(scope, { ...options, connectivity })
  await engine.initialize()
  return engine
}
