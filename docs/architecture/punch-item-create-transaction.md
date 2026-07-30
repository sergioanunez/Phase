# Punch Item Create via Transaction Engine (Phase A3)

First production workflow on the client [Transaction Engine](./transaction-engine.md) and [Server Transaction Layer](./server-transaction-layer.md).

## Selected UI workflow

**Primary authenticated Phase user path only:**

Home detail → Punch list → **Add Punch** → `PunchItemModal` create.

Not migrated: edit, delete, photos upload pipeline, subcontractor report-complete, assistant `create_punchlist` (still uses legacy POST).

## Old flow

```
PunchItemModal → POST /api/tasks/{taskId}/punch-items → optional photos POST → refetch
```

No optimistic UI; no idempotency; photos optional second request.

## New flow (flag on)

```
PunchItemModal
  → generate clientPunchItemId (stable)
  → TransactionEngine.dispatch(PUNCH_ITEM_CREATE)
  → applyOptimistic → IndexedDB localPunchItems
  → processor → POST /api/transactions/punch-item-create
       (Idempotency-Key + body)
  → executeIdempotentMutation + createPunchItemInTransaction(tx)
  → envelope applied|noop|…
  → reconcile local record (server id)
```

Form clears after **local dispatch is durable** (optimistic write), not after server round-trip.

## Feature flag

| Env | Effect |
|---|---|
| `NEXT_PUBLIC_TRANSACTION_ENGINE_PUNCH_CREATE=1` | Client uses TE path |
| unset / `0` | Legacy POST (default) |

Rollback: unset the flag. Rows created via TE remain normal `PunchItem` records.

Never dual-submit.

## Transaction payload

```ts
{
  clientPunchItemId: string  // cuid, stable
  homeTaskId: string
  homeId?: string | null     // optional display/scope
  title: string
  description?: string | null
  assignedContractorId?: string | null
  assignedContractorName?: string | null  // local display only
  dueDate?: string | null    // ISO
  deviceCreatedAt: string    // ISO
  source?: string
}
```

No `companyId`, `userId`, photos, Files, or Blobs.

## clientPunchItemId strategy

**Server field:** `PunchItem.clientGeneratedId`  
**Uniqueness:** `(companyId, clientGeneratedId)`  

Duplicate defenses:

1. `ProcessedMutation` `(companyId, idempotencyKey)`
2. `PunchItem` `(companyId, clientGeneratedId)` → create returns **`noop`** with existing entity

Same key replay → original entity. Different keys, same `clientPunchItemId` → one PunchItem (`noop`).

## Optimistic local model

IndexedDB `phase-offline` v2 store `localPunchItems`:

| syncStatus | Meaning |
|---|---|
| `pending` | Queued |
| `syncing` | Handler in flight |
| `synced` | Reconciled to server id |
| `needs_attention` | Permanent / uncertain |

Merged into the punch list with server rows; synced duplicates by server id are hidden. Synced locals older than 7 days are pruned on engine init.

## Server route

`POST /api/transactions/punch-item-create`

- `requireTenantPermission("tasks:write")`
- session `companyId` / `userId`
- `executeIdempotentMutation` + `context.tx` only
- billing gate before mutation
- notify after commit on **`applied` only**
- audit log inside TX (matches legacy; no ActivityEvent for normal create)

## Legacy compatibility

`POST /api/tasks/[id]/punch-items` remains for assistant and flag-off UI. Marked legacy in source comments.

## Photos

Out of scope for A3. TE create path **rejects** create-with-photos in the modal (user must remove files). After sync, edit/online photo upload remains available on the legacy path for synced items.

## Error mapping

| Envelope | Client |
|---|---|
| applied / noop | succeed + reconcile |
| rejected retryable (503) | retriable; **same idempotency key** |
| rejected permanent | `needs_attention`; keep title |
| uncertain | permanent; `needs_attention`; no auto-retry |
| in_progress | retriable |
| conflict | needs_attention (rare on create) |

## Manual acceptance test plan

Flag: `NEXT_PUBLIC_TRANSACTION_ENGINE_PUNCH_CREATE=1`

| # | Scenario | UI | Engine | IDB | Server rows |
|---|---|---|---|---|---|
| 1 | Online create | Item appears; syncs | succeeded | synced + server id | 1 |
| 2 | Offline create | Item + “Waiting to sync” | pending/retrying | pending | 0 until online |
| 3 | Offline + refresh | Same optimistic item | restored queue | pending | 0 |
| 4 | Offline + browser restart | Same | restored | pending | 0 |
| 5 | Lose connection mid-request | Stays queued | retry same key | pending/syncing | ≤1 |
| 6 | Retry same transaction | No second form submit | same idempotency key | → synced | 1 |
| 7 | Two tabs | Both show item; one processor | one succeed | reconciled both | 1 |
| 8 | Cross-tenant task id | needs_attention / rejected | permanently_failed | needs_attention | 0 |
| 9 | Permanent rejection (e.g. trial) | needs_attention; title kept | permanently_failed | needs_attention | 0 |
| 10 | After sync, prune | List shows server row | idle | local synced pruned after 7d | 1 |

**Core invariant:** one user create action → exactly one `PunchItem`.

## Observability

Structured `console.info` events (no titles/bodies):

- `[PUNCH_ITEM_CREATE] dispatched`
- `[PUNCH_ITEM_CREATE] applied` / `noop` / `rejected`

## Limitations

- Photos not in TE path
- Edit/delete/complete still online-only legacy APIs
- Assistant create not on TE
- Notifications still post-commit (not outbox)
- Flag default off

## Rollback

Unset `NEXT_PUBLIC_TRANSACTION_ENGINE_PUNCH_CREATE`. No data migration required to roll back the UI path.
