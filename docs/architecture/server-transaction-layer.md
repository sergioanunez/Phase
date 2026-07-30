# Server Transaction Layer (Phase A2 / A2.5)

Server guarantees for retries, replay, optimistic concurrency, and a durable outbox.
Complements the client [Transaction Engine](./transaction-engine.md). No production UI workflows are migrated yet.

## Models

### ProcessedMutation

Tenant-scoped idempotency ledger. Uniqueness: `(companyId, idempotencyKey)`.

| Status | Meaning | Same-key behavior |
|---|---|---|
| `processing` | Claim held inside an open transaction (normally **never committed**) | If a committed row is seen: fresh → `in_progress`; stale → `uncertain` |
| `succeeded` | Authoritative completion **or** typed conflict envelope | Replay stored envelope; no re-execute |
| `rejected` | Permanent domain/business rejection | Replay stored rejection; no re-execute |
| `retryable_failed` | Transient failure (defensive / reclaimable) | **Reclaim** and execute again |
| `uncertain` | Outcome unprovable | Return uncertain; **never** auto-re-execute |

**Invariant:** claim insert and finalization share one Prisma `$transaction`. A committed `processing` row is abnormal (manual intervention, legacy data, or a future refactor bug). Stale committed processing (≥ 120s) is marked `uncertain` — never silently re-executed.

**Retryable path (preferred):** throwing `RetryableMutationError` (or classified transient errors) **aborts the transaction**, so the claim rolls back and **no row is persisted**. The client keeps the same idempotency key and retries. The `retryable_failed` enum value exists for reclaim if a row was written defensively.

`companyId` / actor identity always come from the authenticated server session — never from the client payload.

`responseData` stores the minimum envelope for safe replay (no secrets, tokens, or private note bodies). Max size: **16 KB** UTF-8 JSON (`SERVER_TX_POLICY.maxResponseDataBytes`). Stored JSON is schema-validated before replay; corruption → `uncertain`.

Legacy migration: existing `failed` rows map conservatively to **`rejected`**.

### OutboxMessage

Durable external side effects. Uniqueness: `(companyId, deduplicationKey)`.

Statuses: `pending` → `processing` → `succeeded` | `retrying` | `permanently_failed`.

Inserted in the **same database transaction** as the domain mutation. Providers run **after** commit.

## Idempotency lifecycle

1. Validate idempotency key (`8–128` URL-safe: `A–Z a–z 0–9 _ . : -`)
2. Fast-path load existing `ProcessedMutation` and apply same-key policy
3. Inside `$transaction`: reclaim `retryable_failed` **or** `INSERT … ON CONFLICT DO NOTHING`
4. If claim loses: replay / `in_progress` / ask retry
5. `execute({ tx, companyId, mutationId, … })` — **only** `context.tx` for domain/outbox/activity writes
6. Persist terminal status + envelope, or abort TX on retryable failure
7. Return canonical envelope (never raw Prisma messages)

### Same-key retry rules

| Prior state | Behavior |
|---|---|
| `succeeded` | Replay success/conflict envelope |
| `rejected` | Replay rejection (`error.retryable: false`) |
| `uncertain` | Replay uncertain (`retryable: false`) |
| `retryable_failed` | Reclaim → execute again |
| no row (rolled-back retryable) | Claim → execute again |
| `processing` (fresh committed) | `in_progress` (HTTP 202) |
| `processing` (stale committed) | Mark `uncertain` |

**Concurrent callers:** Postgres unique index serializes claimants; only one runs `execute`; others see `in_progress` or replay.

### Error taxonomy

Prefer typed errors over bare `Error`:

| Class | Persisted status | Same-key |
|---|---|---|
| `PermanentRejectionError` | `rejected` | Replay |
| `VersionConflictError` | `succeeded` + conflict envelope | Replay |
| `RetryableMutationError` / transient Prisma codes | TX abort (no row) | Retry same key |
| `UncertainOutcomeError` | `uncertain` | No auto-retry |

Unknown throws inside the TX default to **retryable** (safe when all writes used `tx`).

### Transaction-client discipline

```ts
await executeIdempotentMutation({
  prisma,
  companyId: ctx.companyId,
  actorUserId: ctx.userId,
  idempotencyKey,
  mutationType: "…",
  execute: async ({ tx }) => {
    // ALL domain writes, activity, and outbox inserts use `tx`
    await enqueueOutboxMessage(tx, { … })
    return { status: "applied", idempotencyKey, … }
  },
})
```

Do not use the global Prisma client inside `execute`. Optional dev marker: `SERVER_TX_ASSERT_TX=1`.

## Response envelope (discriminated union)

```ts
type TransactionEnvelope =
  | { status: "applied"; idempotencyKey; entity?; version?; sideEffects?; … }
  | { status: "noop"; … }
  | { status: "conflict"; conflict: { code; message; … }; … }
  | { status: "rejected"; error: { code; message; retryable }; … }
  | { status: "in_progress"; error: { retryable: true }; … }
  | { status: "uncertain"; error: { retryable: false }; … }
```

### HTTP mapping

| Envelope | HTTP |
|---|---|
| `applied` / `noop` | 200 |
| `in_progress` | 202 |
| `conflict` / `uncertain` | 409 |
| `rejected` + `retryable: true` | 503 |
| `rejected` + authz/authn/not found | 401 / 403 / 404 |
| other `rejected` | 400 |

## Versioning

Integer `version` (`@default(1)`) on `Home`, `HomeTask`, `PunchItem`. Helpers: `assertExpectedVersion`, `applyVersionedUpdate`. Production write paths are not fully version-aware yet (see Phase A2 review).

## Transactional outbox

`SEND_CONFIRMATION_SMS` payload prefers identifiers + template version. Dev proof: `NO_OP_TEST_SIDE_EFFECT`.

Processor: ownership via `processingAttemptId`; stale locks ~90s; cron `/api/cron/outbox` every 5 minutes.

## Tenant isolation

Idempotency and outbox rows are always `companyId`-scoped. Punch routes repaired in A2 use session tenant + scoped where.

## Activity log compatibility

Optional metadata: `idempotencyKey`, `mutationType`, `source` (`transaction_engine_online` | `transaction_engine_replay`). One authoritative activity row per successful mutation.

## Test-only mutation

`POST /api/dev/server-tx-test` — disabled in production unless `SERVER_TX_TEST_MUTATION=1`.

## Integration tests

`lib/server-transactions/idempotency.integration.test.ts` runs when:

```bash
RUN_SERVER_TX_INTEGRATION=1
DATABASE_URL=postgresql://…
```

Covers concurrent claim, rollback same-key retry, and permanent rejection persistence.

## Guarantees

- At-most-once domain execution per successful/rejected claim
- Same idempotency key survives transient failures (TX rollback)
- Optimistic concurrency helpers for selected aggregates
- Outbox atomic with domain commits
- Tenant-scoped ledgers

## Non-guarantees

- Provider exactly-once delivery
- Automatic recovery of `uncertain` rows
- Production SMS / punch / schedule handlers on this path (later phases)
- Version increments on all legacy write paths
