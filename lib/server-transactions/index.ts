export {
  executeIdempotentMutation,
  findProcessedMutation,
  type IdempotentMutationContext,
  type IdempotentExecuteParams,
} from "@/lib/server-transactions/idempotency"
export {
  PermanentRejectionError,
  RetryableMutationError,
  UncertainOutcomeError,
  classifyExecuteError,
  isPermanentRejectionError,
  isRetryableMutationError,
  isUncertainOutcomeError,
  isVersionConflictError,
} from "@/lib/server-transactions/errors"
export {
  enqueueOutboxMessage,
  buildConfirmationSmsDedupKey,
  type ConfirmationSmsOutboxPayload,
  type EnqueueOutboxParams,
} from "@/lib/server-transactions/outbox"
export {
  processOutboxBatch,
  type OutboxAdapter,
  type ProcessOutboxOptions,
  type ProcessOutboxResult,
} from "@/lib/server-transactions/outbox-processor"
export {
  classifyOutboxError,
  computeOutboxRetryDelayMs,
} from "@/lib/server-transactions/retry"
export {
  tenantScopedWhere,
  tenantScopedPunchWhere,
  tenantScopedHomeWhere,
} from "@/lib/server-transactions/tenant-scope"
export {
  assertExpectedVersion,
  applyVersionedUpdate,
  versionedResultToConflict,
  VersionConflictError,
  type VersionedUpdateResult,
} from "@/lib/server-transactions/versioning"
export {
  OUTBOX_TYPES,
  SERVER_TX_POLICY,
  envelopeHttpStatus,
  hashResponseData,
  isValidIdempotencyKey,
  parseStoredEnvelope,
  assertResponseDataSize,
  type TransactionEnvelope,
  type TransactionEnvelopeStatus,
  type TransactionConflictPayload,
  type TransactionErrorPayload,
  type AppliedEnvelope,
  type RejectedEnvelope,
  type ConflictEnvelope,
  type InProgressEnvelope,
  type UncertainEnvelope,
  type NoopEnvelope,
  type OutboxType,
} from "@/lib/server-transactions/types"
