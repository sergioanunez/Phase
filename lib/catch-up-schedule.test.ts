import { describe, expect, it } from "vitest"
import {
  isCatchUpDateInFuture,
  isCatchUpEligibleTask,
  selectTaskIdsUpToAnchor,
} from "./catch-up-schedule"

describe("catch-up-schedule", () => {
  it("eligible tasks exclude completed, N/A, and canceled", () => {
    expect(isCatchUpEligibleTask("Scheduled")).toBe(true)
    expect(isCatchUpEligibleTask("Completed")).toBe(false)
    expect(isCatchUpEligibleTask("NotApplicable")).toBe(false)
    expect(isCatchUpEligibleTask("Canceled")).toBe(false)
  })

  it("select to here includes anchor and all prior ids", () => {
    const ordered = ["a", "b", "c", "d"]
    expect(selectTaskIdsUpToAnchor(ordered, "c")).toEqual(["a", "b", "c"])
    expect(selectTaskIdsUpToAnchor(ordered, "missing")).toEqual([])
  })

  it("blocks future completion dates", () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(isCatchUpDateInFuture(tomorrow)).toBe(true)
    expect(isCatchUpDateInFuture(new Date())).toBe(false)
  })
})
