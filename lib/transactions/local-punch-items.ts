/**
 * Local optimistic PunchItem read model (Phase A3).
 * Lives in the same phase-offline IndexedDB as the Transaction Engine queue.
 */
import { createId } from "@paralleldrive/cuid2"
import {
  getTransactionDb,
  type LocalPunchItemRecord,
  type LocalPunchSyncStatus,
} from "@/lib/transactions/db"

export type { LocalPunchItemRecord, LocalPunchSyncStatus }

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function subscribeLocalPunchItems(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function createClientPunchItemId(): string {
  return createId()
}

export async function upsertLocalPunchItem(
  record: LocalPunchItemRecord
): Promise<void> {
  const db = await getTransactionDb()
  await db.put("localPunchItems", {
    ...record,
    updatedAt: Date.now(),
  })
  notify()
}

export async function getLocalPunchItem(
  clientPunchItemId: string
): Promise<LocalPunchItemRecord | undefined> {
  const db = await getTransactionDb()
  return db.get("localPunchItems", clientPunchItemId)
}

export async function listLocalPunchItemsForTask(params: {
  tenantId: string
  userId: string
  homeTaskId: string
}): Promise<LocalPunchItemRecord[]> {
  const db = await getTransactionDb()
  const rows = await db.getAllFromIndex("localPunchItems", "by-scope-task", [
    params.tenantId,
    params.userId,
    params.homeTaskId,
  ])
  return rows.sort((a, b) => (a.deviceCreatedAt < b.deviceCreatedAt ? 1 : -1))
}

export async function markLocalPunchSyncing(
  clientPunchItemId: string
): Promise<void> {
  const existing = await getLocalPunchItem(clientPunchItemId)
  if (!existing) return
  if (existing.syncStatus === "synced") return
  await upsertLocalPunchItem({ ...existing, syncStatus: "syncing" })
}

export async function reconcileLocalPunchItem(params: {
  clientPunchItemId: string
  serverPunchItemId: string
  version?: number | null
  title?: string
  dueDate?: string | null
  assignedContractorId?: string | null
  assignedContractorName?: string | null
  createdAt?: string
}): Promise<void> {
  const existing = await getLocalPunchItem(params.clientPunchItemId)
  if (!existing) return
  await upsertLocalPunchItem({
    ...existing,
    serverPunchItemId: params.serverPunchItemId,
    version: params.version ?? existing.version,
    title: params.title ?? existing.title,
    dueDate: params.dueDate !== undefined ? params.dueDate : existing.dueDate,
    assignedContractorId:
      params.assignedContractorId !== undefined
        ? params.assignedContractorId
        : existing.assignedContractorId,
    assignedContractorName:
      params.assignedContractorName !== undefined
        ? params.assignedContractorName
        : existing.assignedContractorName,
    syncStatus: "synced",
    attentionCode: null,
    attentionMessage: null,
    reconciledAt: Date.now(),
    deviceCreatedAt: params.createdAt ?? existing.deviceCreatedAt,
  })
}

export async function markLocalPunchNeedsAttention(params: {
  clientPunchItemId: string
  code: string
  message: string
}): Promise<void> {
  const existing = await getLocalPunchItem(params.clientPunchItemId)
  if (!existing) return
  await upsertLocalPunchItem({
    ...existing,
    syncStatus: "needs_attention",
    attentionCode: params.code,
    attentionMessage: params.message,
  })
}

export async function removeSyncedLocalPunchItemsOlderThan(
  maxAgeMs: number
): Promise<number> {
  const db = await getTransactionDb()
  const all = await db.getAll("localPunchItems")
  const cutoff = Date.now() - maxAgeMs
  let removed = 0
  for (const row of all) {
    if (
      row.syncStatus === "synced" &&
      row.reconciledAt != null &&
      row.reconciledAt < cutoff
    ) {
      await db.delete("localPunchItems", row.clientPunchItemId)
      removed++
    }
  }
  if (removed > 0) notify()
  return removed
}

/**
 * Merge server list with local optimistic rows for one task.
 * Synced locals that already appear by server id are omitted.
 */
export function mergePunchLists<T extends { id: string }>(params: {
  serverItems: T[]
  localItems: LocalPunchItemRecord[]
  mapLocal: (local: LocalPunchItemRecord) => T & {
    syncStatus?: LocalPunchSyncStatus
    clientPunchItemId?: string
    attentionMessage?: string | null
  }
}): Array<
  T & {
    syncStatus?: LocalPunchSyncStatus
    clientPunchItemId?: string
    attentionMessage?: string | null
  }
> {
  const serverIds = new Set(params.serverItems.map((i) => i.id))
  const merged = params.serverItems.map((item) => ({ ...item }))
  for (const local of params.localItems) {
    if (local.serverPunchItemId && serverIds.has(local.serverPunchItemId)) {
      continue
    }
    merged.unshift(params.mapLocal(local))
  }
  return merged
}
