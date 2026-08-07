import { describe, it, expect } from "vitest"
import {
  countClosedPunchItems,
  countOpenPunchItems,
  isPunchItemOpenStatus,
} from "./punch-list"
import {
  filterPunchListGroups,
  groupPunchItemsByList,
  type PunchListGroupItem,
} from "./group-punch-lists"

function item(
  partial: Partial<PunchListGroupItem> & { id: string; title: string }
): PunchListGroupItem {
  return {
    status: "Open",
    punchListId: null,
    assignedContractorId: null,
    assignedContractor: null,
    dueDate: null,
    ...partial,
  }
}

describe("punch list counts", () => {
  it("counts open and closed statuses", () => {
    const items = [
      { status: "Open" },
      { status: "ReadyForReview" },
      { status: "Closed" },
      { status: "Canceled" },
    ]
    expect(countOpenPunchItems(items)).toBe(2)
    expect(countClosedPunchItems(items)).toBe(2)
    expect(isPunchItemOpenStatus("Open")).toBe(true)
    expect(isPunchItemOpenStatus("Closed")).toBe(false)
  })
})

describe("groupPunchItemsByList", () => {
  it("groups items under the same PunchList", () => {
    const groups = groupPunchItemsByList([
      item({
        id: "1",
        title: "A",
        punchListId: "L1",
        punchList: {
          id: "L1",
          dueDate: "2026-08-09T00:00:00.000Z",
          assignedContractorId: "c1",
          assignedContractor: { id: "c1", companyName: "Haskins Electric" },
        },
      }),
      item({
        id: "2",
        title: "B",
        punchListId: "L1",
        punchList: {
          id: "L1",
          dueDate: "2026-08-09T00:00:00.000Z",
          assignedContractorId: "c1",
          assignedContractor: { id: "c1", companyName: "Haskins Electric" },
        },
      }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe("L1")
    expect(groups[0].contractorName).toBe("Haskins Electric")
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].openCount).toBe(2)
  })

  it("does not merge different contractors into one list", () => {
    const groups = groupPunchItemsByList([
      item({
        id: "1",
        title: "A",
        punchListId: "L1",
        punchList: {
          id: "L1",
          assignedContractorId: "c1",
          assignedContractor: { id: "c1", companyName: "Haskins Electric" },
        },
      }),
      item({
        id: "2",
        title: "B",
        punchListId: "L2",
        punchList: {
          id: "L2",
          assignedContractorId: "c2",
          assignedContractor: { id: "c2", companyName: "Carrete Plumbing" },
        },
      }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.id).sort()).toEqual(["L1", "L2"])
  })

  it("puts items without punchListId in Unassigned / Legacy", () => {
    const groups = groupPunchItemsByList([
      item({ id: "legacy-1", title: "Old item", status: "Open" }),
      item({
        id: "new-1",
        title: "New",
        punchListId: "L1",
        punchList: {
          id: "L1",
          assignedContractorId: "c1",
          assignedContractor: { id: "c1", companyName: "Haskins Electric" },
        },
      }),
    ])
    expect(groups).toHaveLength(2)
    const legacy = groups.find((g) => g.kind === "legacy")
    expect(legacy?.contractorName).toBe("Unassigned / Legacy")
    expect(legacy?.items).toHaveLength(1)
    expect(legacy?.items[0].id).toBe("legacy-1")
  })
})

describe("filterPunchListGroups", () => {
  const groups = groupPunchItemsByList([
    item({
      id: "1",
      title: "Open A",
      status: "Open",
      punchListId: "L1",
      punchList: {
        id: "L1",
        assignedContractor: { id: "c1", companyName: "Haskins Electric" },
      },
    }),
    item({
      id: "2",
      title: "Closed B",
      status: "Closed",
      punchListId: "L1",
      punchList: {
        id: "L1",
        assignedContractor: { id: "c1", companyName: "Haskins Electric" },
      },
    }),
    item({
      id: "3",
      title: "Closed only",
      status: "Closed",
      punchListId: "L2",
      punchList: {
        id: "L2",
        assignedContractor: { id: "c2", companyName: "Carrete Plumbing" },
      },
    }),
  ])

  it("Open shows lists with open items and only those items", () => {
    const open = filterPunchListGroups(groups, "open")
    expect(open).toHaveLength(1)
    expect(open[0].id).toBe("L1")
    expect(open[0].items.map((i) => i.id)).toEqual(["1"])
  })

  it("Closed shows closed items without duplicating lists", () => {
    const closed = filterPunchListGroups(groups, "closed")
    expect(closed.map((g) => g.id).sort()).toEqual(["L1", "L2"])
    const l1 = closed.find((g) => g.id === "L1")
    expect(l1?.items.map((i) => i.id)).toEqual(["2"])
  })

  it("All returns every group", () => {
    expect(filterPunchListGroups(groups, "all")).toHaveLength(2)
  })
})
