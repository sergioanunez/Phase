type TransactionLogEvent =
  | "transaction_queued"
  | "execution_attempted"
  | "sync_started"
  | "transaction_succeeded"
  | "transaction_retried"
  | "dependency_blocked"
  | "conflict_created"
  | "permanent_failure"
  | "processor_lock_acquired"
  | "processor_lock_released"

type SafeLogFields = {
  transactionId?: string
  type?: string
  tenantId?: string
  userId?: string
  retryCount?: number
  errorCode?: string
  lockKind?: "web-lock" | "indexeddb-lease"
}

function masked(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (value.length <= 8) return value
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

export function transactionLog(event: TransactionLogEvent, fields: SafeLogFields = {}): void {
  if (process.env.NODE_ENV !== "development") return

  console.info("[transaction-engine]", {
    event,
    ...fields,
    transactionId: masked(fields.transactionId),
    tenantId: masked(fields.tenantId),
    userId: masked(fields.userId),
    timestamp: new Date().toISOString(),
  })
}
