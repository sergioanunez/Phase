/**
 * Feature flag for Phase A3 Punch Item Create via Transaction Engine.
 *
 * Client: NEXT_PUBLIC_TRANSACTION_ENGINE_PUNCH_CREATE=1
 * Server (optional mirror): TRANSACTION_ENGINE_PUNCH_CREATE=1
 *
 * Default: disabled (legacy POST path). Set to "1" to enable.
 */
export function isPunchCreateTransactionEngineEnabled(): boolean {
  if (typeof process === "undefined") return false
  const pub = process.env.NEXT_PUBLIC_TRANSACTION_ENGINE_PUNCH_CREATE
  if (pub === "1" || pub === "true") return true
  if (pub === "0" || pub === "false") return false
  // Server-only fallback when evaluating in Node without NEXT_PUBLIC
  const srv = process.env.TRANSACTION_ENGINE_PUNCH_CREATE
  return srv === "1" || srv === "true"
}
