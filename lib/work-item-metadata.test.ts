import { describe, it, expect } from "vitest"
import {
  buildWorkItemMilestones,
  formatDurationAria,
  formatDurationShort,
  formatMilestoneDateCompact,
  formatMilestoneDateMedium,
} from "./work-item-metadata"

describe("work-item-metadata", () => {
  describe("formatDurationShort", () => {
    it("formats days as Nd", () => {
      expect(formatDurationShort(2)).toBe("2d")
      expect(formatDurationShort(1)).toBe("1d")
      expect(formatDurationShort(0)).toBe("0d")
    })
    it("returns null for missing values", () => {
      expect(formatDurationShort(null)).toBeNull()
      expect(formatDurationShort(undefined)).toBeNull()
      expect(formatDurationShort(Number.NaN)).toBeNull()
    })
  })

  describe("formatDurationAria", () => {
    it("uses working day(s)", () => {
      expect(formatDurationAria(1)).toBe("1 working day")
      expect(formatDurationAria(2)).toBe("2 working days")
    })
  })

  describe("date formats", () => {
    it("formats compact and medium without year", () => {
      const d = new Date(2026, 6, 13) // Jul 13
      expect(formatMilestoneDateCompact(d)).toBe("7/13")
      expect(formatMilestoneDateMedium(d)).toMatch(/Jul\s*13/)
      expect(formatMilestoneDateMedium(d)).not.toMatch(/2026/)
    })
  })

  describe("buildWorkItemMilestones", () => {
    it("maps lifecycle fields in Called → Scheduled → Started → Completed order", () => {
      const milestones = buildWorkItemMilestones({
        calledAt: "2026-07-10T12:00:00.000Z",
        scheduledDate: "2026-07-13T12:00:00.000Z",
        startedAt: null,
        completedAt: "2026-07-14T12:00:00.000Z",
      })
      expect(milestones.map((m) => m.key)).toEqual([
        "called",
        "scheduled",
        "started",
        "completed",
      ])
      expect(milestones[0].date).not.toBeNull()
      expect(milestones[2].date).toBeNull()
      expect(milestones[3].date).not.toBeNull()
    })
  })
})
