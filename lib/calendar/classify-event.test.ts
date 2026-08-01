import { describe, it, expect } from "vitest"
import { classifyCalendarTaskType } from "./classify-event"

describe("classifyCalendarTaskType", () => {
  it("marks inspection tasks by name", () => {
    expect(
      classifyCalendarTaskType({ taskName: "Final Inspection", categoryName: null })
    ).toBe("inspection")
  })

  it("marks inspection tasks by category", () => {
    expect(
      classifyCalendarTaskType({
        taskName: "Frame check",
        categoryName: "Structural Inspections",
      })
    ).toBe("inspection")
  })

  it("defaults other tasks to trade/work", () => {
    expect(
      classifyCalendarTaskType({ taskName: "Frame House", categoryName: "Framing" })
    ).toBe("trade")
  })
})
