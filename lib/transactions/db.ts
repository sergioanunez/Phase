import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { StoredTransaction, TransactionStatus } from "@/lib/transactions/types"

export const TRANSACTION_DB_NAME = "phase-offline"
/** v2: localPunchItems store for Phase A3 optimistic punch creates. */
export const TRANSACTION_DB_VERSION = 2

export type SyncMetadataRecord = {
  key: string
  scopeKey: string
  name: string
  ownerId?: string
  expiresAt?: number
  value?: string | number | boolean | null
  updatedAt: number
}

export type LocalPunchSyncStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "needs_attention"

export type LocalPunchItemRecord = {
  clientPunchItemId: string
  tenantId: string
  userId: string
  homeTaskId: string
  homeId?: string | null
  title: string
  description: string | null
  assignedContractorId: string | null
  assignedContractorName: string | null
  dueDate: string | null
  status: string
  syncStatus: LocalPunchSyncStatus
  transactionId: string | null
  serverPunchItemId: string | null
  version: number | null
  attentionCode: string | null
  attentionMessage: string | null
  deviceCreatedAt: string
  updatedAt: number
  reconciledAt: number | null
}

interface PhaseOfflineSchema extends DBSchema {
  transactions: {
    key: string
    value: StoredTransaction
    indexes: {
      "by-status": TransactionStatus
      "by-created-at": number
      "by-scope": [string, string]
      "by-scope-status": [string, string, TransactionStatus]
      "by-next-retry-at": number
      "by-dependency": string
    }
  }
  syncMetadata: {
    key: string
    value: SyncMetadataRecord
    indexes: {
      "by-scope": string
    }
  }
  localPunchItems: {
    key: string
    value: LocalPunchItemRecord
    indexes: {
      "by-scope": [string, string]
      "by-scope-task": [string, string, string]
      "by-sync-status": LocalPunchSyncStatus
    }
  }
}

let dbPromise: Promise<IDBPDatabase<PhaseOfflineSchema>> | null = null

export function getTransactionDb(): Promise<IDBPDatabase<PhaseOfflineSchema>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"))
  }

  if (!dbPromise) {
    dbPromise = openDB<PhaseOfflineSchema>(TRANSACTION_DB_NAME, TRANSACTION_DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains("transactions")) {
          const transactions = db.createObjectStore("transactions", { keyPath: "id" })
          transactions.createIndex("by-status", "status")
          transactions.createIndex("by-created-at", "createdAt")
          transactions.createIndex("by-scope", ["tenantId", "userId"])
          transactions.createIndex("by-scope-status", ["tenantId", "userId", "status"])
          transactions.createIndex("by-next-retry-at", "nextRetryAt")
          transactions.createIndex("by-dependency", "dependsOn", { multiEntry: true })
        }

        if (!db.objectStoreNames.contains("syncMetadata")) {
          const metadata = db.createObjectStore("syncMetadata", { keyPath: "key" })
          metadata.createIndex("by-scope", "scopeKey")
        }

        if (oldVersion < 2) {
          if (db.objectStoreNames.contains("localPunchItems")) {
            db.deleteObjectStore("localPunchItems")
          }
          const store = db.createObjectStore("localPunchItems", {
            keyPath: "clientPunchItemId",
          })
          store.createIndex("by-scope", ["tenantId", "userId"])
          store.createIndex("by-scope-task", ["tenantId", "userId", "homeTaskId"])
          store.createIndex("by-sync-status", "syncStatus")
        }
      },
      terminated() {
        dbPromise = null
      },
    })
  }

  return dbPromise
}

export function scopeKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`
}

export async function closeTransactionDb(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}

export async function resetTransactionDatabaseForTests(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Transaction database reset is test-only")
  }
  await closeTransactionDb()
  await deleteDB(TRANSACTION_DB_NAME)
}
