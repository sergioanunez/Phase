import { describe, it, expect, vi } from "vitest"
import { createPunchListWithItems, addItemToPunchList } from "./punch-list"

function createFakeTx() {
  const lists: any[] = []
  const punches: any[] = []

  return {
    punchList: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.clientGeneratedId) {
          return lists.find((l) => l.clientGeneratedId === where.clientGeneratedId) ?? null
        }
        return lists.find((l) => l.id === where.id && l.companyId === where.companyId) ?? null
      }),
      findFirstOrThrow: vi.fn(async ({ where }: any) => {
        const list = lists.find((l) => l.id === where.id)
        return {
          ...list,
          items: punches.filter((p) => p.punchListId === list.id),
          assignedContractor: { id: list.assignedContractorId, companyName: "Haskins" },
          createdBy: { id: "u1", name: "User" },
        }
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: "list-1", ...data }
        lists.push(row)
        return row
      }),
      update: vi.fn(async () => ({})),
    },
    punchItem: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.clientGeneratedId) {
          return punches.find((p) => p.clientGeneratedId === where.clientGeneratedId) ?? null
        }
        return null
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `item-${punches.length + 1}`,
          ...data,
          createdBy: { id: data.createdByUserId, name: "User" },
          assignedContractor: { id: data.assignedContractorId, companyName: "Haskins" },
          photos: [],
        }
        punches.push(row)
        return row
      }),
      count: vi.fn(async () => punches.filter((p) => p.status === "Open").length),
    },
    homeTask: {
      findFirst: vi.fn(async () => ({
        id: "task-1",
        homeId: "home-1",
        companyId: "co-1",
        nameSnapshot: "QC",
        home: { id: "home-1", companyId: "co-1", addressOrLot: "Lot 1" },
      })),
      update: vi.fn(async () => ({})),
    },
    contractor: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.id === "c1" ? { id: "c1", companyName: "Haskins" } : null
      ),
    },
    __lists: lists,
    __punches: punches,
  }
}

describe("createPunchListWithItems", () => {
  it("creates one list with multiple items sharing punchListId", async () => {
    const tx = createFakeTx()
    const result = await createPunchListWithItems({
      tx: tx as never,
      companyId: "co-1",
      actorUserId: "u1",
      homeTaskId: "task-1",
      input: {
        assignedContractorId: "c1",
        dueDate: "2026-08-09T12:00:00.000Z",
        clientPunchListId: "client-list-1",
        items: [
          { title: "Reinstall sensor", clientPunchItemId: "ci-1" },
          { title: "Connect ground", clientPunchItemId: "ci-2" },
        ],
      },
    })
    expect(result.created).toBe(true)
    expect(tx.__lists).toHaveLength(1)
    expect(tx.__punches).toHaveLength(2)
    expect(tx.__punches.every((p) => p.punchListId === "list-1")).toBe(true)
    expect(tx.__punches.every((p) => p.assignedContractorId === "c1")).toBe(true)
  })

  it("is idempotent for the same clientPunchListId", async () => {
    const tx = createFakeTx()
    const input = {
      assignedContractorId: "c1",
      clientPunchListId: "client-list-1",
      items: [{ title: "One", clientPunchItemId: "ci-1" }],
    }
    const first = await createPunchListWithItems({
      tx: tx as never,
      companyId: "co-1",
      actorUserId: "u1",
      homeTaskId: "task-1",
      input,
    })
    const second = await createPunchListWithItems({
      tx: tx as never,
      companyId: "co-1",
      actorUserId: "u1",
      homeTaskId: "task-1",
      input,
    })
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(tx.__lists).toHaveLength(1)
  })
})

describe("addItemToPunchList", () => {
  it("adds an item without creating another list", async () => {
    const tx = createFakeTx()
    await createPunchListWithItems({
      tx: tx as never,
      companyId: "co-1",
      actorUserId: "u1",
      homeTaskId: "task-1",
      input: {
        assignedContractorId: "c1",
        clientPunchListId: "client-list-1",
        items: [{ title: "First", clientPunchItemId: "ci-1" }],
      },
    })
    const added = await addItemToPunchList({
      tx: tx as never,
      companyId: "co-1",
      actorUserId: "u1",
      punchListId: "list-1",
      title: "Second",
      clientPunchItemId: "ci-2",
    })
    expect(added.created).toBe(true)
    expect(tx.__lists).toHaveLength(1)
    expect(tx.__punches).toHaveLength(2)
    expect(tx.__punches[1].punchListId).toBe("list-1")
  })

  it("does not duplicate on same clientPunchItemId", async () => {
    const tx = createFakeTx()
    await createPunchListWithItems({
      tx: tx as never,
      companyId: "co-1",
      actorUserId: "u1",
      homeTaskId: "task-1",
      input: {
        assignedContractorId: "c1",
        items: [{ title: "First", clientPunchItemId: "ci-1" }],
      },
    })
    await addItemToPunchList({
      tx: tx as never,
      companyId: "co-1",
      actorUserId: "u1",
      punchListId: "list-1",
      title: "Second",
      clientPunchItemId: "ci-2",
    })
    const again = await addItemToPunchList({
      tx: tx as never,
      companyId: "co-1",
      actorUserId: "u1",
      punchListId: "list-1",
      title: "Second",
      clientPunchItemId: "ci-2",
    })
    expect(again.created).toBe(false)
    expect(tx.__punches).toHaveLength(2)
  })

  it("rejects add when punch list belongs to another tenant", async () => {
    const tx = createFakeTx()
    await createPunchListWithItems({
      tx: tx as never,
      companyId: "co-1",
      actorUserId: "u1",
      homeTaskId: "task-1",
      input: {
        assignedContractorId: "c1",
        items: [{ title: "First", clientPunchItemId: "ci-1" }],
      },
    })
    await expect(
      addItemToPunchList({
        tx: tx as never,
        companyId: "co-other",
        actorUserId: "u2",
        punchListId: "list-1",
        title: "Should fail",
        clientPunchItemId: "ci-other",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(tx.__punches).toHaveLength(1)
  })
})
