/**
 * PostgreSQL integration tests for ProcessedMutation claim / rollback / same-key retry.
 *
 * Required environment:
 *   RUN_SERVER_TX_INTEGRATION=1
 *   DATABASE_URL=postgresql://...   (pooler or direct; must have migrations applied)
 *
 * Optional:
 *   DIRECT_URL=...  (if migrations need it separately)
 *
 * These tests create and delete rows under companyId prefix `stx-it-` and skip
 * when the env flag is not set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createId } from "@paralleldrive/cuid2"
import {
  executeIdempotentMutation,
  PermanentRejectionError,
  RetryableMutationError,
} from "@/lib/server-transactions"

const enabled = process.env.RUN_SERVER_TX_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL)

describe.runIf(enabled)("ProcessedMutation PostgreSQL integration", () => {
  let prisma: import("@prisma/client").PrismaClient
  let companyId: string

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client")
    prisma = new PrismaClient()
    const company = await prisma.company.create({
      data: {
        id: `stx-it-${createId()}`,
        name: `Server TX IT ${Date.now()}`,
      },
    })
    companyId = company.id
  })

  afterAll(async () => {
    if (!prisma || !companyId) return
    await prisma.processedMutation.deleteMany({ where: { companyId } })
    await prisma.outboxMessage.deleteMany({ where: { companyId } })
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {})
    await prisma.$disconnect()
  })

  it("concurrent unique claim executes once", async () => {
    const key = `it-race-${createId().slice(0, 12)}`
    let runs = 0
    const execute = async () => {
      runs++
      await new Promise((r) => setTimeout(r, 50))
      return {
        status: "applied" as const,
        idempotencyKey: key,
        entity: { runs },
      }
    }

    const [a, b] = await Promise.all([
      executeIdempotentMutation({
        prisma,
        companyId,
        idempotencyKey: key,
        mutationType: "IT_RACE",
        execute,
      }),
      executeIdempotentMutation({
        prisma,
        companyId,
        idempotencyKey: key,
        mutationType: "IT_RACE",
        execute,
      }),
    ])

    expect(runs).toBe(1)
    expect([a.status, b.status].every((s) => s === "applied" || s === "in_progress")).toBe(
      true
    )
    const rows = await prisma.processedMutation.findMany({
      where: { companyId, idempotencyKey: key },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe("succeeded")
  })

  it("rollback on retryable failure leaves key free for same-key retry", async () => {
    const key = `it-retry-${createId().slice(0, 12)}`
    const first = await executeIdempotentMutation({
      prisma,
      companyId,
      idempotencyKey: key,
      mutationType: "IT_RETRY",
      execute: async () => {
        throw new RetryableMutationError({ code: "DATABASE_TRANSIENT" })
      },
    })
    expect(first.status).toBe("rejected")
    if (first.status === "rejected") expect(first.error.retryable).toBe(true)

    const lingering = await prisma.processedMutation.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey: key } },
    })
    expect(lingering).toBeNull()

    const second = await executeIdempotentMutation({
      prisma,
      companyId,
      idempotencyKey: key,
      mutationType: "IT_RETRY",
      execute: async () => ({
        status: "applied" as const,
        idempotencyKey: key,
        entity: { ok: true },
      }),
    })
    expect(second.status).toBe("applied")
  })

  it("permanent rejection persists and does not re-execute", async () => {
    const key = `it-perm-${createId().slice(0, 12)}`
    let runs = 0
    const execute = async () => {
      runs++
      throw new PermanentRejectionError({
        code: "FORBIDDEN_STATE",
        message: "Not allowed",
      })
    }
    const first = await executeIdempotentMutation({
      prisma,
      companyId,
      idempotencyKey: key,
      mutationType: "IT_PERM",
      execute,
    })
    const second = await executeIdempotentMutation({
      prisma,
      companyId,
      idempotencyKey: key,
      mutationType: "IT_PERM",
      execute,
    })
    expect(runs).toBe(1)
    expect(first.status).toBe("rejected")
    expect(second.status).toBe("rejected")
    const row = await prisma.processedMutation.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey: key } },
    })
    expect(row?.status).toBe("rejected")
  })
})

describe.runIf(!enabled)("ProcessedMutation PostgreSQL integration (skipped)", () => {
  it("documents required env vars", () => {
    expect(true).toBe(true)
  })
})
