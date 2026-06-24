import { describe, expect, it } from "vitest"
import {
  badgeLabelForTaskStatus,
  isExcludedFromActiveWork,
  isExcludedFromProgress,
  isTaskIncompleteForProgress,
  isTaskResolvedForScheduling,
} from "./task-status"

describe("task-status", () => {
  it("treats NotApplicable as excluded from progress and active work", () => {
    expect(isExcludedFromProgress("NotApplicable")).toBe(true)
    expect(isExcludedFromActiveWork("NotApplicable")).toBe(true)
    expect(isTaskIncompleteForProgress("NotApplicable")).toBe(false)
    expect(isTaskResolvedForScheduling("NotApplicable")).toBe(true)
  })

  it("keeps Canceled out of progress but not resolved for scheduling", () => {
    expect(isExcludedFromProgress("Canceled")).toBe(true)
    expect(isTaskResolvedForScheduling("Canceled")).toBe(false)
  })

  it("renders compact N/A badge label", () => {
    expect(badgeLabelForTaskStatus("NotApplicable")).toBe("N/A")
  })
})
