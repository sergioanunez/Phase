/**
 * In-memory Prisma stand-in for server-transaction unit tests.
 * Supports ProcessedMutation claim via $queryRaw INSERT…ON CONFLICT DO NOTHING,
 * OutboxMessage CRUD, and $transaction nesting.
 */
import { createId } from "@paralleldrive/cuid2"

type MutationRow = {
  id: string
  companyId: string
  actorUserId: string | null
  idempotencyKey: string
  mutationType: string
  entityType: string | null
  entityId: string | null
  status: "processing" | "succeeded" | "rejected" | "retryable_failed" | "uncertain"
  responseData: unknown
  responseHash: string | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
  expiresAt: Date | null
}

type OutboxRow = {
  id: string
  companyId: string
  type: string
  deduplicationKey: string
  aggregateType: string | null
  aggregateId: string | null
  payload: unknown
  status: "pending" | "processing" | "retrying" | "succeeded" | "permanently_failed"
  attempts: number
  maxAttempts: number
  nextAttemptAt: Date
  lockedAt: Date | null
  lockedBy: string | null
  processingAttemptId: string | null
  providerReference: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdAt: Date
  updatedAt: Date
  sentAt: Date | null
}

type VersionedEntity = {
  id: string
  companyId: string
  version: number
  [key: string]: unknown
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (key === "AND" && Array.isArray(expected)) {
      if (!expected.every((clause) => matchesWhere(row, clause as Record<string, unknown>))) {
        return false
      }
      continue
    }
    if (key === "OR" && Array.isArray(expected)) {
      if (!expected.some((clause) => matchesWhere(row, clause as Record<string, unknown>))) {
        return false
      }
      continue
    }
    if (key === "status" && expected && typeof expected === "object" && "in" in (expected as object)) {
      const list = (expected as { in: unknown[] }).in
      if (!list.includes(row[key])) return false
      continue
    }
    if (key === "nextAttemptAt" && expected && typeof expected === "object" && "lte" in (expected as object)) {
      const lte = (expected as { lte: Date }).lte
      if (!(row[key] instanceof Date) || (row[key] as Date).getTime() > lte.getTime()) return false
      continue
    }
    if (key === "lockedAt" && expected && typeof expected === "object" && "lt" in (expected as object)) {
      const lt = (expected as { lt: Date }).lt
      if (!(row[key] instanceof Date) || (row[key] as Date).getTime() >= lt.getTime()) return false
      continue
    }
    if (row[key] !== expected) return false
  }
  return true
}

function applyData(row: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in (value as object)) {
      row[key] = Number(row[key] ?? 0) + Number((value as { increment: number }).increment)
    } else {
      row[key] = value as unknown
    }
  }
  row.updatedAt = new Date()
}

export function createInMemoryServerTxPrisma() {
  const mutations = new Map<string, MutationRow>()
  const outbox = new Map<string, OutboxRow>()
  const entities = new Map<string, VersionedEntity>()
  let rollback = false

  const snapshot = () => ({
    mutations: new Map(mutations),
    outbox: new Map(outbox),
    entities: new Map(
      [...entities.entries()].map(([k, v]) => [k, { ...v }])
    ),
  })

  const restore = (snap: ReturnType<typeof snapshot>) => {
    mutations.clear()
    outbox.clear()
    entities.clear()
    for (const [k, v] of snap.mutations) mutations.set(k, v)
    for (const [k, v] of snap.outbox) outbox.set(k, v)
    for (const [k, v] of snap.entities) entities.set(k, v)
  }

  const mutationKey = (companyId: string, key: string) => `${companyId}::${key}`
  const outboxKey = (companyId: string, key: string) => `${companyId}::${key}`

  function processedMutationApi() {
    return {
      findUnique: async ({ where }: { where: { companyId_idempotencyKey?: { companyId: string; idempotencyKey: string }; id?: string } }) => {
        if (where.id) return [...mutations.values()].find((m) => m.id === where.id) ?? null
        if (where.companyId_idempotencyKey) {
          const k = mutationKey(
            where.companyId_idempotencyKey.companyId,
            where.companyId_idempotencyKey.idempotencyKey
          )
          return mutations.get(k) ?? null
        }
        return null
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = [...mutations.values()].find((m) => m.id === where.id)
        if (!row) throw new Error("ProcessedMutation not found")
        applyData(row as unknown as Record<string, unknown>, data)
        return row
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>
        data: Record<string, unknown>
      }) => {
        let count = 0
        for (const row of mutations.values()) {
          if (matchesWhere(row as unknown as Record<string, unknown>, where)) {
            applyData(row as unknown as Record<string, unknown>, data)
            count++
          }
        }
        return { count }
      },
    }
  }

  function outboxApi() {
    return {
      findUnique: async ({
        where,
      }: {
        where: { companyId_deduplicationKey?: { companyId: string; deduplicationKey: string }; id?: string }
      }) => {
        if (where.id) return outbox.get(where.id) ?? null
        if (where.companyId_deduplicationKey) {
          const k = outboxKey(
            where.companyId_deduplicationKey.companyId,
            where.companyId_deduplicationKey.deduplicationKey
          )
          return [...outbox.values()].find(
            (r) =>
              r.companyId === where.companyId_deduplicationKey!.companyId &&
              r.deduplicationKey === where.companyId_deduplicationKey!.deduplicationKey
          ) ?? null
        }
        return null
      },
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: Record<string, unknown>
        orderBy?: Array<Record<string, string>> | Record<string, string>
        take?: number
      }) => {
        let rows = [...outbox.values()].filter((r) =>
          matchesWhere(r as unknown as Record<string, unknown>, where)
        )
        const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
        for (const ord of [...orders].reverse()) {
          const [field, dir] = Object.entries(ord)[0] ?? []
          if (!field) continue
          rows.sort((a, b) => {
            const av = (a as Record<string, unknown>)[field]
            const bv = (b as Record<string, unknown>)[field]
            const cmp =
              av instanceof Date && bv instanceof Date
                ? av.getTime() - bv.getTime()
                : String(av).localeCompare(String(bv))
            return dir === "desc" ? -cmp : cmp
          })
        }
        if (take != null) rows = rows.slice(0, take)
        return rows
      },
      create: async ({ data }: { data: Partial<OutboxRow> }) => {
        const id = createId()
        const row: OutboxRow = {
          id,
          companyId: data.companyId!,
          type: data.type!,
          deduplicationKey: data.deduplicationKey!,
          aggregateType: data.aggregateType ?? null,
          aggregateId: data.aggregateId ?? null,
          payload: data.payload ?? {},
          status: (data.status as OutboxRow["status"]) ?? "pending",
          attempts: data.attempts ?? 0,
          maxAttempts: data.maxAttempts ?? 8,
          nextAttemptAt: data.nextAttemptAt ?? new Date(),
          lockedAt: null,
          lockedBy: null,
          processingAttemptId: null,
          providerReference: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          sentAt: null,
        }
        const dup = [...outbox.values()].find(
          (r) => r.companyId === row.companyId && r.deduplicationKey === row.deduplicationKey
        )
        if (dup) {
          const err = new Error("Unique constraint") as Error & { code?: string }
          err.code = "P2002"
          throw err
        }
        outbox.set(id, row)
        return row
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>
        data: Record<string, unknown>
      }) => {
        let count = 0
        for (const row of outbox.values()) {
          if (matchesWhere(row as unknown as Record<string, unknown>, where)) {
            applyData(row as unknown as Record<string, unknown>, data)
            count++
          }
        }
        return { count }
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return (
          [...outbox.values()].find((r) =>
            matchesWhere(r as unknown as Record<string, unknown>, where)
          ) ?? null
        )
      },
    }
  }

  function entityDelegate() {
    return {
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>
        data: Record<string, unknown>
      }) => {
        let count = 0
        for (const row of entities.values()) {
          if (matchesWhere(row, where)) {
            applyData(row, data)
            count++
          }
        }
        return { count }
      },
      findFirst: async ({
        where,
        select,
      }: {
        where: Record<string, unknown>
        select?: Record<string, boolean>
      }) => {
        const row = [...entities.values()].find((r) => matchesWhere(r, where))
        if (!row) return null
        if (!select) return { ...row }
        const picked: Record<string, unknown> = {}
        for (const [k, on] of Object.entries(select)) {
          if (on) picked[k] = row[k]
        }
        return picked as { version: number; [key: string]: unknown }
      },
    }
  }

  function parseReclaim(values: unknown[]): Array<{ id: string }> {
    // actorUserId, mutationType, entityType, entityId, companyId, key
    const companyId = String(values[4])
    const key = String(values[5])
    const mapKey = mutationKey(companyId, key)
    const row = mutations.get(mapKey)
    if (!row || row.status !== "retryable_failed") return []
    row.status = "processing"
    row.actorUserId = values[0] == null ? null : String(values[0])
    row.mutationType = String(values[1])
    row.entityType = values[2] == null ? null : String(values[2])
    row.entityId = values[3] == null ? null : String(values[3])
    row.responseData = null
    row.responseHash = null
    row.errorCode = null
    row.errorMessage = null
    row.completedAt = null
    row.updatedAt = new Date()
    return [{ id: row.id }]
  }

  function parseClaimInsert(values: unknown[]): Array<{ id: string }> {
    // Tagged template value order from idempotency.ts:
    // id, companyId, actorUserId, key, mutationType, entityType, entityId
    const id = String(values[0])
    const companyId = String(values[1])
    const actorUserId = values[2] == null ? null : String(values[2])
    const key = String(values[3])
    const mutationType = String(values[4])
    const entityType = values[5] == null ? null : String(values[5])
    const entityId = values[6] == null ? null : String(values[6])
    const mapKey = mutationKey(companyId, key)
    if (mutations.has(mapKey)) return []
    const row: MutationRow = {
      id,
      companyId,
      actorUserId,
      idempotencyKey: key,
      mutationType,
      entityType,
      entityId,
      status: "processing",
      responseData: null,
      responseHash: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      expiresAt: null,
    }
    mutations.set(mapKey, row)
    return [{ id }]
  }

  const client: any = {
    processedMutation: processedMutationApi(),
    outboxMessage: outboxApi(),
    punchItem: entityDelegate(),
    homeTask: entityDelegate(),
    home: entityDelegate(),
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      if (sql.includes('UPDATE "ProcessedMutation"') && sql.includes("retryable_failed")) {
        return parseReclaim(values)
      }
      if (sql.includes('INSERT INTO "ProcessedMutation"')) {
        return parseClaimInsert(values)
      }
      throw new Error(`Unsupported $queryRaw in fake: ${sql.slice(0, 80)}`)
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const snap = snapshot()
      rollback = false
      try {
        const result = await fn(client)
        if (rollback) {
          restore(snap)
          throw new Error("Transaction rolled back")
        }
        return result
      } catch (error) {
        restore(snap)
        throw error
      }
    },
    /** Test helpers */
    __seedEntity(entity: VersionedEntity) {
      entities.set(entity.id, { ...entity })
    },
    __seedMutation(row: Partial<MutationRow> & Pick<MutationRow, "companyId" | "idempotencyKey" | "status">) {
      const id = row.id ?? createId()
      const full: MutationRow = {
        id,
        companyId: row.companyId,
        actorUserId: row.actorUserId ?? null,
        idempotencyKey: row.idempotencyKey,
        mutationType: row.mutationType ?? "TEST",
        entityType: row.entityType ?? null,
        entityId: row.entityId ?? null,
        status: row.status,
        responseData: row.responseData ?? null,
        responseHash: row.responseHash ?? null,
        errorCode: row.errorCode ?? null,
        errorMessage: row.errorMessage ?? null,
        createdAt: row.createdAt ?? new Date(),
        updatedAt: row.updatedAt ?? new Date(),
        completedAt: row.completedAt ?? null,
        expiresAt: row.expiresAt ?? null,
      }
      mutations.set(mutationKey(full.companyId, full.idempotencyKey), full)
      return full
    },
    __getMutations() {
      return [...mutations.values()]
    },
    __getOutbox() {
      return [...outbox.values()]
    },
    __forceRollbackNext() {
      rollback = true
    },
    __clear() {
      mutations.clear()
      outbox.clear()
      entities.clear()
    },
  }

  return client
}
