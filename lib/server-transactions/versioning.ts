import type { Prisma } from "@prisma/client"
import type { TransactionConflictPayload } from "@/lib/server-transactions/types"

export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT"
  readonly conflict: TransactionConflictPayload

  constructor(conflict: TransactionConflictPayload) {
    super(conflict.message)
    this.name = "VersionConflictError"
    this.conflict = conflict
  }
}

export function assertExpectedVersion(params: {
  currentVersion: number
  expectedVersion: number
  entityType?: string
  serverValue?: unknown
}): void {
  if (params.currentVersion !== params.expectedVersion) {
    throw new VersionConflictError({
      code: "VERSION_CONFLICT",
      message: `${params.entityType ?? "Entity"} changed since your last sync.`,
      baseVersion: params.expectedVersion,
      serverVersion: params.currentVersion,
      serverValue: params.serverValue,
    })
  }
}

/**
 * Atomic compare-and-swap update. Returns whether a row was updated.
 * Callers must distinguish not-found vs conflict with a follow-up scoped read.
 */
export type VersionedUpdateResult =
  | { outcome: "applied"; newVersion: number }
  | { outcome: "conflict"; currentVersion: number; serverValue?: unknown }
  | { outcome: "missing" }

type VersionedEntityDelegate = {
  updateMany: (args: {
    where: Record<string, unknown>
    data: Record<string, unknown>
  }) => Promise<{ count: number }>
  findFirst: (args: {
    where: Record<string, unknown>
    select?: Record<string, boolean>
  }) => Promise<{ version: number; [key: string]: unknown } | null>
}

/**
 * Apply a versioned update atomically.
 * Uses `where: { id, companyId, version: expectedVersion }` + `version: { increment: 1 }`.
 * If zero rows update, resolves missing vs conflict via a tenant-scoped follow-up read.
 */
export async function applyVersionedUpdate(params: {
  delegate: VersionedEntityDelegate
  id: string
  companyId: string
  expectedVersion: number
  data: Record<string, unknown>
  /** Extra AND clauses for legacy nullable companyId rows (OR-scoped). */
  tenantWhere?: Record<string, unknown>
  serverValueSelect?: Record<string, boolean>
}): Promise<VersionedUpdateResult> {
  const baseWhere = params.tenantWhere
    ? { id: params.id, version: params.expectedVersion, ...params.tenantWhere }
    : { id: params.id, companyId: params.companyId, version: params.expectedVersion }

  const updated = await params.delegate.updateMany({
    where: baseWhere,
    data: {
      ...params.data,
      version: { increment: 1 },
    },
  })

  if (updated.count === 1) {
    return { outcome: "applied", newVersion: params.expectedVersion + 1 }
  }

  const lookupWhere = params.tenantWhere
    ? { id: params.id, ...params.tenantWhere }
    : { id: params.id, companyId: params.companyId }

  const current = await params.delegate.findFirst({
    where: lookupWhere,
    select: {
      version: true,
      ...(params.serverValueSelect ?? {}),
    },
  })

  if (!current) return { outcome: "missing" }

  const { version, ...serverValue } = current
  return {
    outcome: "conflict",
    currentVersion: version,
    serverValue: Object.keys(serverValue).length > 0 ? serverValue : undefined,
  }
}

/** Convenience: throw VersionConflictError or return null for missing. */
export function versionedResultToConflict(
  result: Extract<VersionedUpdateResult, { outcome: "conflict" }>,
  entityType?: string
): VersionConflictError {
  return new VersionConflictError({
    code: "VERSION_CONFLICT",
    message: `${entityType ?? "Entity"} changed since your last sync.`,
    baseVersion: undefined,
    serverVersion: result.currentVersion,
    serverValue: result.serverValue,
  })
}

export type PunchItemVersionWhere = Prisma.PunchItemWhereInput
