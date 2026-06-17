import { describe, expect, it } from "vitest"
import { autoSortHomes, compareHomesByDisplayOrder } from "./display-order"

describe("compareHomesByDisplayOrder", () => {
  it("sorts by displayOrder first", () => {
    const a = { displayOrder: 200, addressOrLot: "B" }
    const b = { displayOrder: 100, addressOrLot: "A" }
    expect(compareHomesByDisplayOrder(a, b)).toBeGreaterThan(0)
  })
})

describe("autoSortHomes", () => {
  const homes = [
    { id: "1", displayOrder: 100, addressOrLot: "14549 Blackbrush Parkway" },
    { id: "2", displayOrder: 200, addressOrLot: "14545 Blackbrush Parkway" },
    { id: "3", displayOrder: 300, addressOrLot: "700 Tranquil Court" },
  ]

  it("sorts by address (numeric-aware)", () => {
    const sorted = autoSortHomes(homes, "address")
    // 700 < 14545 < 14549 when leading numbers are compared numerically
    expect(sorted.map((h) => h.id)).toEqual(["3", "2", "1"])
  })

  it("sorts by lot number from address", () => {
    const sorted = autoSortHomes(homes, "lot")
    expect(sorted[0]!.addressOrLot).toContain("700")
    expect(sorted[1]!.addressOrLot).toContain("14545")
    expect(sorted[2]!.addressOrLot).toContain("14549")
  })
})
