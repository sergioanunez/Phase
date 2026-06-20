import { describe, it, expect } from "vitest"
import {
  calendarDateInputToIso,
  formatScheduledDateInput,
  normalizeStoredScheduledDate,
  parseCalendarDateInput,
} from "./calendar-date"

describe("parseCalendarDateInput", () => {
  it("parses yyyy-MM-dd as local calendar date, not UTC midnight", () => {
    const d = parseCalendarDateInput("2026-06-22")
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(22)
  })

  it("round-trips through formatScheduledDateInput", () => {
    const iso = calendarDateInputToIso("2026-06-22")
    expect(formatScheduledDateInput(iso)).toBe("2026-06-22")
  })
})

describe("normalizeStoredScheduledDate", () => {
  it("bumps UTC midnight to UTC noon on the same calendar day", () => {
    const normalized = normalizeStoredScheduledDate(new Date("2026-06-22T00:00:00.000Z"))
    expect(normalized.toISOString()).toBe("2026-06-22T12:00:00.000Z")
  })

  it("formats legacy UTC-midnight dates as the intended calendar day", () => {
    expect(formatScheduledDateInput("2026-06-22T00:00:00.000Z")).toBe("2026-06-22")
  })
})
