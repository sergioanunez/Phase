import { describe, it, expect } from "vitest"
import {
  isWorkingDay,
  normalizeToWorkingDay,
  addWorkingDays,
  subWorkingDays,
  workingDayDiff,
  diffWorkingDays,
} from "./working-days"

function date(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d)
}

describe("working days", () => {
  describe("isWorkingDay", () => {
    it("returns false for Saturday and Sunday", () => {
      expect(isWorkingDay(date(2026, 2, 21))).toBe(false) // Sat
      expect(isWorkingDay(date(2026, 2, 22))).toBe(false) // Sun
    })
    it("returns true for Monday through Friday", () => {
      expect(isWorkingDay(date(2026, 2, 23))).toBe(true) // Mon
      expect(isWorkingDay(date(2026, 2, 27))).toBe(true) // Fri
    })
  })

  describe("normalizeToWorkingDay", () => {
    it("leaves weekdays unchanged (midnight)", () => {
      const fri = date(2026, 2, 27) // Friday
      const norm = normalizeToWorkingDay(fri)
      expect(norm.getDay()).toBe(5)
      expect(norm.getHours()).toBe(0)
      expect(norm.getMinutes()).toBe(0)
    })

    it("moves Saturday to following Monday", () => {
      const sat = date(2026, 2, 21) // Saturday
      const norm = normalizeToWorkingDay(sat)
      expect(norm.getDay()).toBe(1) // Monday
    })

    it("moves Sunday to following Monday", () => {
      const sun = date(2026, 2, 22) // Sunday
      const norm = normalizeToWorkingDay(sun)
      expect(norm.getDay()).toBe(1) // Monday
    })
  })

  describe("addWorkingDays", () => {
    it("returns same date when n is 0 or negative", () => {
      const d = date(2026, 2, 25)
      expect(addWorkingDays(d, 0)).toEqual(d)
      expect(addWorkingDays(d, -1).getTime()).toEqual(d.getTime())
    })
    it("advances by n working days skipping weekends", () => {
      const mon = date(2026, 2, 23) // Monday
      const nextMon = addWorkingDays(mon, 5)
      expect(nextMon.getDate()).toBe(2)
      expect(nextMon.getMonth()).toBe(2) // March
      expect(nextMon.getFullYear()).toBe(2026)
    })
    it("one working day from Friday is Monday", () => {
      const fri = date(2026, 2, 27)
      const next = addWorkingDays(fri, 1)
      expect(next.getDay()).toBe(1)
      expect(next.getDate()).toBe(2)
      expect(next.getMonth()).toBe(2)
    })
  })

  describe("subWorkingDays", () => {
    it("returns same date when n is 0 or negative", () => {
      const d = date(2026, 2, 25)
      expect(subWorkingDays(d, 0)).toEqual(d)
    })
    it("goes backward by n working days", () => {
      const mon = date(2026, 2, 23) // Monday
      const prev = subWorkingDays(mon, 1)
      expect(prev.getDay()).toBe(5) // Friday
      expect(prev.getDate()).toBe(20)
    })
  })

  describe("workingDayDiff", () => {
    it("returns 0 when end <= start", () => {
      const a = date(2026, 2, 25)
      const b = date(2026, 2, 24)
      expect(workingDayDiff(a, b)).toBe(0)
      expect(workingDayDiff(a, a)).toBe(0)
    })
    it("counts working days between start and end", () => {
      const mon = date(2026, 2, 23)
      const fri = date(2026, 2, 27)
      expect(workingDayDiff(mon, fri)).toBe(4)
    })
  })

  describe("diffWorkingDays", () => {
    it("returns positive when b > a", () => {
      const a = date(2026, 2, 23)
      const b = date(2026, 2, 27)
      expect(diffWorkingDays(a, b)).toBe(4)
    })
    it("returns negative when b < a", () => {
      const a = date(2026, 2, 27)
      const b = date(2026, 2, 23)
      expect(diffWorkingDays(a, b)).toBe(-4)
    })
  })
})
