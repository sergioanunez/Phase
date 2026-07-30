import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { handleApiError } from "@/lib/api-response"
import {
  enqueueOutboxMessage,
  envelopeHttpStatus,
  executeIdempotentMutation,
  OUTBOX_TYPES,
  VersionConflictError,
  type TransactionEnvelope,
} from "@/lib/server-transactions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Development/test-only idempotent mutation.
 * Disabled in production unless SERVER_TX_TEST_MUTATION=1.
 */
function isTestMutationEnabled(): boolean {
  if (process.env.SERVER_TX_TEST_MUTATION === "1") return true
  return process.env.NODE_ENV !== "production"
}

const bodySchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  value: z.string().max(200).optional(),
  expectedVersion: z.number().int().positive().optional(),
  enqueueSideEffect: z.boolean().optional(),
})

type TestEntity = {
  id: string
  companyId: string
  value: string
  version: number
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    if (!isTestMutationEnabled()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { requireTenantPermission } = await import("@/lib/rbac")
    const { prisma } = await import("@/lib/prisma")
    const ctx = await requireTenantPermission("tasks:write")
    const body = bodySchema.parse(await request.json())

    const envelope = await executeIdempotentMutation<TestEntity>({
      prisma,
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      idempotencyKey: body.idempotencyKey,
      mutationType: "SERVER_TX_NO_OP_TEST",
      entityType: "ServerTxTestCounter",
      execute: async ({ tx }) => {
        // Use ProcessedMutation-adjacent lightweight counter in Outbox payload only —
        // store a tiny tenant-scoped JSON blob via outbox + response (no production table).
        const serverVersion = 1
        if (body.expectedVersion != null && body.expectedVersion !== serverVersion) {
          throw new VersionConflictError({
            code: "VERSION_CONFLICT",
            message: "Test counter version mismatch",
            baseVersion: body.expectedVersion,
            serverVersion,
            serverValue: { value: "server" },
          })
        }

        const entity: TestEntity = {
          id: `test-${ctx.companyId.slice(0, 8)}`,
          companyId: ctx.companyId,
          value: body.value ?? "ok",
          version: serverVersion + 1,
        }

        const sideEffects: NonNullable<
          Extract<TransactionEnvelope<TestEntity>, { status: "applied" }>["sideEffects"]
        > = []
        if (body.enqueueSideEffect) {
          const row = await enqueueOutboxMessage(tx, {
            companyId: ctx.companyId,
            type: OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT,
            deduplicationKey: `noop-test:${body.idempotencyKey}`,
            aggregateType: "ServerTxTestCounter",
            aggregateId: entity.id,
            payload: {
              template: "noop_test_v1",
              // identifiers only — no PII
              companyId: ctx.companyId,
              mutationKey: body.idempotencyKey,
            },
          })
          sideEffects.push({
            type: OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT,
            status: "pending",
            referenceId: row.id,
          })
        }

        return {
          status: "applied" as const,
          idempotencyKey: body.idempotencyKey,
          entity,
          entityId: entity.id,
          entityType: "ServerTxTestCounter",
          version: entity.version,
          sideEffects,
        }
      },
    })

    return NextResponse.json(envelope, { status: envelopeHttpStatus(envelope) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    return handleApiError(error)
  }
}
