import { describe, it, expect } from "vitest"
import {
  appendCalendarQueryFilters,
  homeTaskWhereFromCalendarFilters,
  parseCalendarQueryFilters,
  punchItemWhereFromCalendarFilters,
} from "./filters"

describe("parseCalendarQueryFilters", () => {
  it("reads known filter keys", () => {
    const sp = new URLSearchParams({
      contractorId: "c1",
      subdivisionId: "s1",
      start: "ignored-elsewhere",
    })
    expect(parseCalendarQueryFilters(sp)).toEqual({
      contractorId: "c1",
      subdivisionId: "s1",
    })
  })

  it("ignores empty values", () => {
    const sp = new URLSearchParams({ contractorId: "  " })
    expect(parseCalendarQueryFilters(sp)).toEqual({})
  })
})

describe("appendCalendarQueryFilters", () => {
  it("writes only set filters", () => {
    const params = new URLSearchParams({ start: "x" })
    appendCalendarQueryFilters(params, { contractorId: "c1" })
    expect(params.get("start")).toBe("x")
    expect(params.get("contractorId")).toBe("c1")
    expect(params.get("subdivisionId")).toBeNull()
  })
})

describe("where builders", () => {
  it("maps contractor to HomeTask.contractorId", () => {
    expect(homeTaskWhereFromCalendarFilters({ contractorId: "c1" })).toEqual({
      contractorId: "c1",
    })
  })

  it("maps contractor to punch via relatedHomeTask", () => {
    expect(punchItemWhereFromCalendarFilters({ contractorId: "c1" })).toEqual({
      relatedHomeTask: { contractorId: "c1" },
    })
  })
})
