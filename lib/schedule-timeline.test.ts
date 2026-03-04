import { describe, it, expect } from "vitest"
import { getDeltaDays, getScheduleStatus, getScheduleBadge, getTimelinePositions } from "./schedule-timeline"

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
})
