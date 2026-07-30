# Transaction Engine (Phase A1.1)

Client foundation for durable offline-capable writes. Server idempotency, versioning, and production handlers are intentionally out of scope.

## Public API

Application code must import only from `@/lib/transactions`.

```ts
import { TransactionEngine } from "@/lib/transactions"

const engine = new TransactionEngine({ tenantId, userId })
await engine.initialize()

const result = await engine.dispatch({
  type: "NO_OP_TEST",
  entityId: "…",
  houseId: "…",
  payload: { value: "demo" },
  dependsOn: [],
})

engine.subscribe((status) => { /* banner later */ })
await engine.sync()
await engine.retry(result.transactionId)
await engine.resolveConflict(id, { intent: "keep_server" })
await engine.discard(id, "user dismissed")
await engine.resumeAfterAuthentication({ tenantId, userId })
engine.stop()
```

`dispatch` injects the engine scope. Callers cannot override `tenantId` / `userId`.

`dispatch` returns a slim result: `{ transactionId, status, optimisticApplied }`.

Internals (queue, processor, connectivity, coordination, IndexedDB, retry helpers) are not exported from the public barrel. Tests may use `@/lib/transactions/internal/test-utils`.

## State machine

Transaction statuses:

| Status | Kind | Notes |
|---|---|---|
| `pending` | retryable | Eligible when dependencies allow |
| `processing` | in-flight | Owns a `processingAttemptId` |
| `retrying` | retryable | Waits until `nextRetryAt` |
| `blocked` | soft-terminal | Waiting on failed/missing dependency; may become pending after reevaluation |
| `conflict` | soft-terminal | Requires `resolveConflict` |
| `succeeded` | terminal | |
| `permanently_failed` | soft-terminal | Manual `retry` allowed |
| `discarded` | terminal | Explicit discard only |

Aggregate `syncState`: `idle` | `syncing` | `paused` (auth). The unused `error` sync state was removed.

## Retry policy

- Exponential backoff from 3s, capped at 5 minutes, with ±20% jitter
- Honors `Retry-After` within the cap
- Default automatic attempts: **8** (`TRANSACTION_POLICY.maxAutomaticRetries`)
- Exhaustion → `permanently_failed` with `RETRY_EXHAUSTED`
- `engine.retry()` resets `retryCount` and returns to `pending`
- Auth / conflict do not consume the transient attempt budget as permanent exhaustion

## Retry wake scheduler

One timer per engine instance:

1. After init / queue changes / sync / discard / conflict resolution, find earliest future `nextRetryAt`
2. Schedule a single timer for that timestamp
3. Replace the timer if an earlier retry appears
4. On fire: if initialized, same scope, online, and not auth-paused → `sync()`
5. If offline at fire time: do not spin; reconnect reschedules
6. `stop()` clears the timer

## Handler timeout

- Default: **30s** (`TRANSACTION_POLICY.executionTimeoutMs`)
- Handlers may override via `executionTimeoutMs`
- `execute` receives `{ signal, attempt, scope, processingAttemptId }`
- Timeout → retriable (`TIMEOUT`)
- Late completion after timeout/ownership loss cannot mark `succeeded`

**Non-guarantee:** aborting a fetch does not cancel server work unless the transport honors `AbortSignal`. Future server idempotency remains the duplicate-prevention authority.

## Processor ownership

Aligned timings:

| Knob | Value |
|---|---|
| Handler timeout | 30s |
| IndexedDB lease | 60s |
| Lease renew | 20s |
| Stale `processing` recovery | 90s |

When entering `processing`, the processor assigns a unique `processingAttemptId`. Status updates after execute must match that attempt id. Stolen leases / timed-out attempts cannot reconcile.

Web Locks remain preferred when available; IndexedDB lease is the fallback.

## Conflict resolution

`resolveConflict(id, { intent })`:

- `keep_server` → noop success + optional optimistic cleanup (no re-execute)
- `apply_local` → handler rebase → pending with new base metadata
- `discard_local` → discard path

Handlers without `resolveConflict` return `UNSUPPORTED_RESOLUTION`.

## Discard

`discard(id, reason)` marks `discarded` with timestamp/reason. Not eligible again.
Discarding a parent blocks dependents unless the child handler sets `discardWithParent`.

## Authentication pause / resume

401 → transaction returns to `pending`, aggregate `authenticationPaused=true` (persisted).
While paused: connectivity / visibility must not execute handlers.
`resumeAfterAuthentication(session)` verifies scope, clears pause, schedules retries, syncs when online.

## Dependency reevaluation

When a parent succeeds, blocked children become `pending` if all dependencies succeeded.
Failed / discarded / conflicted parents keep children blocked (or discard children if `discardWithParent`).

## Sync debounce

Near-simultaneous triggers coalesce (~50ms). Explicit `sync()` flushes immediately.
Processor lock remains the concurrency boundary.

## Guarantees and non-guarantees

**Guarantees (client):**

- Persist-before-execute for dispatched transactions
- Tenant/user scoped queue isolation
- Attempt-token rejection of stale completions
- Bounded automatic retries + wake timer
- No authenticated API Cache Storage for offline domain data (Phase 0)

**Non-guarantees:**

- Exactly-once provider delivery (server aims for effectively-once via ProcessedMutation + outbox; see [server-transaction-layer.md](./server-transaction-layer.md))
- True cancellation of in-flight HTTP after timeout
- Production domain conflict rules (handlers not migrated yet)

## Server contract (Phase A2 / A2.5)

Server idempotency, versioning, transactional outbox, and response envelopes live in `@/lib/server-transactions`. Documented in [server-transaction-layer.md](./server-transaction-layer.md).

**Same-key retries:** the client must keep one `idempotencyKey` per queued transaction. Transient server failures return `rejected` with `error.retryable: true` (HTTP 503) and leave the key free (transaction rolled back). Permanent rejections and uncertain outcomes do not re-execute on the same key.

Production UI workflows are not migrated yet; handlers should eventually:

1. Send the queued transaction’s idempotency key
2. Include `baseVersion` for versioned aggregates
3. Map envelope `status` to client outcomes
4. Never call Twilio from the browser — SMS goes through the server outbox
5. Use only `context.tx` for domain writes inside `executeIdempotentMutation`

### First production handler (Phase A3)

`PUNCH_ITEM_CREATE` — see [punch-item-create-transaction.md](./punch-item-create-transaction.md).
