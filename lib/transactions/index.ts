/**
 * Public Transaction Engine surface.
 * Application code should import only from this module.
 */
export { TransactionEngine } from "@/lib/transactions/engine"
export type { TransactionEngineOptions } from "@/lib/transactions/engine"
export {
  TRANSACTION_POLICY,
  TransactionEngineError,
} from "@/lib/transactions/types"
export type {
  AggregateTransactionStatus,
  ConflictResolutionInput,
  ConflictResolutionIntent,
  ConnectivityState,
  DispatchResultStatus,
  SyncState,
  TransactionDispatchInput,
  TransactionDispatchResult,
  TransactionPayloadMap,
  TransactionScope,
  TransactionStatus,
  TransactionType,
} from "@/lib/transactions/types"
