import { describe, expect, it, vi } from "vitest"
import { PunchCategory, PunchSeverity } from "@prisma/client"
import { createPunchItemInTransaction } from "@/lib/punch/create-punch-item"
import { PermanentRejectionError } from "@/lib/server-transactions"

function createFakeTx(seed?: {
  task?: { id: string; homeId: string; companyId: string | null }
  existing?: { id: string; clientGeneratedId: string; companyId: string }
}) {
  const punches: any[] = seed?.existing
    ? [
        {
          id: seed.existing.id,
          clientGeneratedId: seed.existing.clientGeneratedId,
          companyId: seed.existing.companyId,
          homeId: "home-1",
          relatedHomeTaskId: "task-1",
          title: "Existing",
          description: null,
          assignedContractorId: null,
          assignedContractor: null,
          status: "Open",
          dueDate: null,
          version: 1,
          createdAt: new Date(),
          createdBy: { id: "u1", name: "User" },
        },
      ]
    : []

  return {
    punchItem: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.clientGeneratedId) {
          return punches.find((p) => p.clientGeneratedId === where.clientGeneratedId) ?? null
        }
        return null
      }),
      create: vi.fn(async ({ data }: any) => {
        if (punches.some((p) => p.clientGeneratedId === data.clientGeneratedId)) {
          const err = new Error("Unique") as Error & { code?: string }
          err.code = "P2002"
          throw err
        }
        const row = {
          id: "srv-new",
          ...data,
          version: 1,
          createdAt: new Date(),
          createdBy: { id: data.createdByUserId, name: "User" },
          assignedContractor: null,
        }
        punches.push(row)
        return row
      }),
      count: vi.fn(async () => punches.filter((p) => p.status === "Open").length),
    },
    homeTask: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.id !== (seed?.task?.id ?? "task-1")) return null
        if (!seed?.task) return null
        return {
          id: seed.task.id,
          homeId: seed.task.homeId,
          companyId: seed.task.companyId,
          nameSnapshot: "Plumbing",
          home: { id: seed.task.homeId, addressOrLot: "Lot 1", companyId: seed.task.companyId },
        }
      }),
      update: vi.fn(async () => ({})),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
    __punches: punches,
  }
}

describe("createPunchItemInTransaction", () => {
  it("creates punch with clientGeneratedId", async () => {
    const tx = createFakeTx({
      task: { id: "task-1", homeId: "home-1", companyId: "co-a" },
    })
    const result = await createPunchItemInTransaction({
      tx: tx as never,
      companyId: "co-a",
      actorUserId: "u1",
      idempotencyKey: "idem-key-aaaa",
      input: {
        idempotencyKey: "idem-key-aaaa",
        clientPunchItemId: "client-punch-1",
        homeTaskId: "task-1",
        title: "Fix leak",
        category: PunchCategory.Other,
        severity: PunchSeverity.Minor,
      },
    })
    expect(result.status).toBe("applied")
    if (result.status === "applied") {
      expect(result.entity?.clientGeneratedId).toBe("client-punch-1")
      expect(result.entity?.title).toBe("Fix leak")
    }
    expect(tx.auditLog.create).toHaveBeenCalled()
  })

  it("returns noop for existing clientGeneratedId", async () => {
    const tx = createFakeTx({
      task: { id: "task-1", homeId: "home-1", companyId: "co-a" },
      existing: { id: "srv-1", clientGeneratedId: "client-punch-1", companyId: "co-a" },
    })
    const result = await createPunchItemInTransaction({
      tx: tx as never,
      companyId: "co-a",
      actorUserId: "u1",
      idempotencyKey: "idem-key-bbbb",
      input: {
        idempotencyKey: "idem-key-bbbb",
        clientPunchItemId: "client-punch-1",
        homeTaskId: "task-1",
        title: "Fix leak",
      },
    })
    expect(result.status).toBe("noop")
    expect(tx.punchItem.create).not.toHaveBeenCalled()
  })

  it("rejects missing task as NOT_FOUND", async () => {
    const tx = createFakeTx()
    await expect(
      createPunchItemInTransaction({
        tx: tx as never,
        companyId: "co-a",
        actorUserId: "u1",
        idempotencyKey: "idem-key-cccc",
        input: {
          idempotencyKey: "idem-key-cccc",
          clientPunchItemId: "client-punch-2",
          homeTaskId: "missing",
          title: "X",
        },
      })
    ).rejects.toBeInstanceOf(PermanentRejectionError)
  })
})
