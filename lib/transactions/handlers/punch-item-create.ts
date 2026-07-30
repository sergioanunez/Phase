import { TransactionExecutionError } from "@/lib/transactions/retry"
import {
  markLocalPunchNeedsAttention,
  markLocalPunchSyncing,
  reconcileLocalPunchItem,
  upsertLocalPunchItem,
} from "@/lib/transactions/local-punch-items"
import type {
  TransactionHandler,
  TransactionPayloadMap,
} from "@/lib/transactions/types"

export type PunchItemCreatePayload = TransactionPayloadMap["PUNCH_ITEM_CREATE"]

type ServerEnvelope = {
  status: string
  idempotencyKey?: string
  mutationId?: string
  entityId?: string
  entityType?: string
  version?: number
  entity?: {
    id: string
    clientGeneratedId?: string
    title?: string
    dueDate?: string | null
    assignedContractorId?: string | null
    assignedContractor?: { id: string; companyName: string } | null
    version?: number
    createdAt?: string
  }
  error?: { code: string; message: string; retryable: boolean }
  conflict?: { code: string; message: string }
}

export const punchItemCreateHandler: TransactionHandler<"PUNCH_ITEM_CREATE"> = {
  type: "PUNCH_ITEM_CREATE",

  validate(payload) {
    const p = payload as TransactionPayloadMap["PUNCH_ITEM_CREATE"]
    if (!p?.clientPunchItemId || p.clientPunchItemId.length < 8) {
      throw new Error("clientPunchItemId is required")
    }
    if (!p.homeTaskId) throw new Error("homeTaskId is required")
    if (!p.title?.trim()) throw new Error("title is required")
    if (!p.deviceCreatedAt) throw new Error("deviceCreatedAt is required")
  },

  async applyOptimistic(transaction) {
    const payload = transaction.payload as TransactionPayloadMap["PUNCH_ITEM_CREATE"]
    await upsertLocalPunchItem({
      clientPunchItemId: payload.clientPunchItemId,
      tenantId: transaction.tenantId,
      userId: transaction.userId,
      homeTaskId: payload.homeTaskId,
      homeId: payload.homeId ?? null,
      title: payload.title,
      description: payload.description ?? null,
      assignedContractorId: payload.assignedContractorId ?? null,
      assignedContractorName: payload.assignedContractorName ?? null,
      dueDate: payload.dueDate ?? null,
      status: "Open",
      syncStatus: "pending",
      transactionId: transaction.id,
      serverPunchItemId: null,
      version: null,
      attentionCode: null,
      attentionMessage: null,
      deviceCreatedAt: payload.deviceCreatedAt,
      updatedAt: Date.now(),
      reconciledAt: null,
    })
  },

  async execute({ transaction, signal }) {
    const payload = transaction.payload as TransactionPayloadMap["PUNCH_ITEM_CREATE"]
    await markLocalPunchSyncing(payload.clientPunchItemId)

    const body = {
      idempotencyKey: transaction.idempotencyKey,
      clientPunchItemId: payload.clientPunchItemId,
      homeTaskId: payload.homeTaskId,
      title: payload.title,
      description: payload.description ?? null,
      assignedContractorId: payload.assignedContractorId ?? null,
      dueDate: payload.dueDate ?? null,
      deviceCreatedAt: payload.deviceCreatedAt,
      source: payload.source ?? "transaction_engine",
    }

    const res = await fetch("/api/transactions/punch-item-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": transaction.idempotencyKey,
      },
      body: JSON.stringify(body),
      signal,
      credentials: "same-origin",
    })

    let envelope: ServerEnvelope
    try {
      envelope = (await res.json()) as ServerEnvelope
    } catch {
      throw new TransactionExecutionError({
        kind: res.status >= 500 || res.status === 429 ? "retriable" : "permanent",
        code: `HTTP_${res.status}`,
        message: "Invalid server response",
      })
    }

    return mapEnvelopeToResult(envelope, res.status, payload.clientPunchItemId)
  },

  async reconcile(transaction, result) {
    const payload = transaction.payload as TransactionPayloadMap["PUNCH_ITEM_CREATE"]
    const meta = (result.resultMetadata ?? {}) as {
      serverPunchItemId?: string
      version?: number
      title?: string
      dueDate?: string | null
      assignedContractorId?: string | null
      assignedContractorName?: string | null
      createdAt?: string
    }
    if (meta.serverPunchItemId) {
      await reconcileLocalPunchItem({
        clientPunchItemId: payload.clientPunchItemId,
        serverPunchItemId: meta.serverPunchItemId,
        version: meta.version,
        title: meta.title,
        dueDate: meta.dueDate,
        assignedContractorId: meta.assignedContractorId,
        assignedContractorName: meta.assignedContractorName,
        createdAt: meta.createdAt,
      })
    }
  },

  async discardOptimistic(transaction) {
    const payload = transaction.payload as TransactionPayloadMap["PUNCH_ITEM_CREATE"]
    await markLocalPunchNeedsAttention({
      clientPunchItemId: payload.clientPunchItemId,
      code: "DISCARDED",
      message: "This punch item was discarded and will not sync.",
    })
  },
}

async function mapEnvelopeToResult(
  envelope: ServerEnvelope,
  httpStatus: number,
  clientPunchItemId: string
) {
  if (envelope.status === "applied" || envelope.status === "noop") {
    const entity = envelope.entity
    const serverId = entity?.id ?? envelope.entityId
    if (!serverId) {
      throw new TransactionExecutionError({
        kind: "permanent",
        code: "MISSING_ENTITY",
        message: "Server did not return a punch item",
      })
    }
    return {
      status: envelope.status === "noop" ? ("noop" as const) : ("applied" as const),
      resultMetadata: {
        serverPunchItemId: serverId,
        version: entity?.version ?? envelope.version ?? null,
        title: entity?.title ?? null,
        dueDate: entity?.dueDate ?? null,
        assignedContractorId: entity?.assignedContractorId ?? null,
        assignedContractorName: entity?.assignedContractor?.companyName ?? null,
        createdAt: entity?.createdAt ?? null,
        replayed: envelope.status === "noop",
      },
    }
  }

  if (envelope.status === "in_progress") {
    throw new TransactionExecutionError({
      kind: "retriable",
      code: "IN_PROGRESS",
      message: "Mutation is still processing",
      retryAfterMs: 1000,
    })
  }

  if (envelope.status === "uncertain") {
    await markLocalPunchNeedsAttention({
      clientPunchItemId,
      code: envelope.error?.code ?? "UNCERTAIN",
      message:
        envelope.error?.message ??
        "This change may already exist. Check your punch list before retrying.",
    })
    throw new TransactionExecutionError({
      kind: "permanent",
      code: envelope.error?.code ?? "UNCERTAIN",
      message: envelope.error?.message ?? "Uncertain outcome",
    })
  }

  if (envelope.status === "conflict") {
    await markLocalPunchNeedsAttention({
      clientPunchItemId,
      code: envelope.conflict?.code ?? "CONFLICT",
      message: envelope.conflict?.message ?? "Could not create punch item",
    })
    throw new TransactionExecutionError({
      kind: "conflict",
      code: envelope.conflict?.code ?? "CONFLICT",
      message: envelope.conflict?.message ?? "Conflict",
      conflictMetadata: envelope.conflict as never,
    })
  }

  if (envelope.status === "rejected") {
    const retryable = envelope.error?.retryable === true || httpStatus === 503
    if (retryable) {
      throw new TransactionExecutionError({
        kind: "retriable",
        code: envelope.error?.code ?? `HTTP_${httpStatus}`,
        message: envelope.error?.message ?? "Temporary server error",
      })
    }
    await markLocalPunchNeedsAttention({
      clientPunchItemId,
      code: envelope.error?.code ?? "REJECTED",
      message: envelope.error?.message ?? "Could not create punch item",
    })
    throw new TransactionExecutionError({
      kind: "permanent",
      code: envelope.error?.code ?? "REJECTED",
      message: envelope.error?.message ?? "Rejected",
    })
  }

  if (httpStatus === 401) {
    throw new TransactionExecutionError({
      kind: "authentication",
      code: "HTTP_401",
      message: "Authentication required",
    })
  }

  throw new TransactionExecutionError({
    kind: httpStatus >= 500 ? "retriable" : "permanent",
    code: `HTTP_${httpStatus}`,
    message: "Unexpected server response",
  })
}
