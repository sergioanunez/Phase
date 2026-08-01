import { describe, it, expect } from "vitest"
import {
  getDeltaDays,
  getScheduleStatus,
  getScheduleBadge,
  getDeltaChip,
  getForecastPercent,
  getTimelinePositions,
  getTimelineLabelLayout,
} from "./schedule-timeline"

function date(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d)
}

describe("schedule-timeline", () => {
  describe("getDeltaDays", () => {
    it("returns negative when forecast is before target (ahead)", () => {
      const target = date(2026, 6, 15)
      const forecast = date(2026, 6, 10)
      expect(getDeltaDays(forecast, target)).toBe(-5)
    })
    it("returns zero when forecast equals target (on time)", () => {
      const d = date(2026, 6, 15)
      expect(getDeltaDays(d, d)).toBe(0)
    })
    it("returns positive when forecast is after target (behind)", () => {
      const target = date(2026, 6, 15)
      const forecast = date(2026, 6, 20)
      expect(getDeltaDays(forecast, target)).toBe(5)
    })
    it("normalizes to start of day", () => {
      const target = new Date(2026, 5, 15, 23, 59, 59)
      const forecast = new Date(2026, 5, 16, 0, 0, 1)
      expect(getDeltaDays(forecast, target)).toBe(1)
    })
  })

  describe("getScheduleStatus", () => {
    it("returns ahead for negative deltaDays", () => {
      expect(getScheduleStatus(-1)).toBe("ahead")
      expect(getScheduleStatus(-10)).toBe("ahead")
    })
    it("returns on-time for zero", () => {
      expect(getScheduleStatus(0)).toBe("on-time")
    })
    it("returns behind for positive deltaDays", () => {
      expect(getScheduleStatus(1)).toBe("behind")
      expect(getScheduleStatus(10)).toBe("behind")
    })
  })

  describe("getScheduleBadge", () => {
    it("formats ahead with abs(deltaDays) and 'early'", () => {
      expect(getScheduleBadge(-3).text).toBe("🟢 3d early")
      expect(getScheduleBadge(-1).text).toBe("🟢 1d early")
      expect(getScheduleBadge(-3).ariaLabel).toBe("3 days early")
    })
    it("formats on-time as single line", () => {
      expect(getScheduleBadge(0).text).toBe("🟡 on time")
      expect(getScheduleBadge(0).ariaLabel).toBe("On time")
    })
    it("formats behind with deltaDays and 'late'", () => {
      expect(getScheduleBadge(5).text).toBe("🔴 5d late")
      expect(getScheduleBadge(1).text).toBe("🔴 1d late")
      expect(getScheduleBadge(5).ariaLabel).toBe("5 days late")
    })
  })

  describe("getDeltaChip", () => {
    it("returns success chip for early", () => {
      expect(getDeltaChip(-3).text).toBe("3 days early")
      expect(getDeltaChip(-3).variant).toBe("success")
      expect(getDeltaChip(-1).text).toBe("1 day early")
    })
    it("returns neutral chip for on target", () => {
      expect(getDeltaChip(0).text).toBe("On target")
      expect(getDeltaChip(0).variant).toBe("neutral")
    })
    it("returns warning chip for late within 7 days (At Risk)", () => {
      expect(getDeltaChip(5).text).toBe("5 days late")
      expect(getDeltaChip(5).variant).toBe("warning")
    })
    it("returns danger chip for late 7+ days (Behind)", () => {
      expect(getDeltaChip(8).text).toBe("8 days late")
      expect(getDeltaChip(8).variant).toBe("danger")
    })
  })

  describe("getForecastPercent", () => {
    it("returns 0 when forecast equals start", () => {
      const start = date(2026, 5, 1)
      const target = date(2026, 7, 1)
      expect(getForecastPercent(start, target, start)).toBe(0)
    })
    it("returns 100 when forecast equals target", () => {
      const start = date(2026, 5, 1)
      const target = date(2026, 7, 1)
      expect(getForecastPercent(start, target, target)).toBe(100)
    })
    it("returns 50 when forecast is midway", () => {
      const start = date(2026, 5, 1)
      const target = date(2026, 5, 31)
      const forecast = date(2026, 5, 16)
      expect(getForecastPercent(start, target, forecast)).toBe(50)
    })
    it("clamps to 0 when forecast is before start", () => {
      const start = date(2026, 5, 1)
      const target = date(2026, 7, 1)
      const forecast = date(2026, 4, 15)
      expect(getForecastPercent(start, target, forecast)).toBe(0)
    })
    it("clamps to 100 when forecast is after target", () => {
      const start = date(2026, 5, 1)
      const target = date(2026, 7, 1)
      const forecast = date(2026, 8, 1)
      expect(getForecastPercent(start, target, forecast)).toBe(100)
    })
  })

  describe("getTimelinePositions", () => {
    it("places points in chronological order", () => {
      const start = date(2026, 5, 1)
      const target = date(2026, 6, 15)
      const forecast = date(2026, 6, 10)
      const { points } = getTimelinePositions(start, target, forecast)
      expect(points.map((p) => p.type)).toEqual(["start", "forecast", "target"])
      expect(points[0].position).toBeLessThanOrEqual(points[1].position)
      expect(points[1].position).toBeLessThanOrEqual(points[2].position)
    })
    it("computes hasOverrun when forecast is after target", () => {
      const start = date(2026, 5, 1)
      const target = date(2026, 6, 15)
      const forecast = date(2026, 6, 25)
      const { hasOverrun, overrunStart, overrunEnd } = getTimelinePositions(start, target, forecast)
      expect(hasOverrun).toBe(true)
      expect(overrunStart).toBeLessThan(overrunEnd)
    })
    it("no overrun when forecast is on or before target", () => {
      const start = date(2026, 5, 1)
      const target = date(2026, 6, 15)
      expect(getTimelinePositions(start, target, date(2026, 6, 15)).hasOverrun).toBe(false)
      expect(getTimelinePositions(start, target, date(2026, 6, 10)).hasOverrun).toBe(false)
    })
  })

  describe("getTimelineLabelLayout", () => {
    it("uses spread when markers are far apart", () => {
      expect(getTimelineLabelLayout(120)).toBe("spread")
      expect(getTimelineLabelLayout(90)).toBe("spread")
    })
    it("uses split when markers are close but not overlapping", () => {
      expect(getTimelineLabelLayout(89)).toBe("split")
      expect(getTimelineLabelLayout(40)).toBe("split")
      expect(getTimelineLabelLayout(28)).toBe("split")
    })
    it("uses cluster when markers are extremely close", () => {
      expect(getTimelineLabelLayout(27)).toBe("cluster")
      expect(getTimelineLabelLayout(0)).toBe("cluster")
    })
  })
})
