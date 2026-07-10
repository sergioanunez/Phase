import { describe, it, expect } from "vitest"
import { getScheduleStatus, isHomeConstructionStarted } from "./schedule-status"

describe("isHomeConstructionStarted", () => {
  const today = new Date("2026-07-10T12:00:00")

  it("is false without start date and no scheduled tasks", () => {
    expect(isHomeConstructionStarted(null, 0, today)).toBe(false)
  })

  it("is true when tasks are scheduled even without start date", () => {
    expect(isHomeConstructionStarted(null, 1, today)).toBe(true)
  })

  it("is true when start date is today or in the past", () => {
    expect(isHomeConstructionStarted("2026-06-30", 0, today)).toBe(true)
    expect(isHomeConstructionStarted("2026-07-10", 0, today)).toBe(true)
  })

  it("is false when start date is in the future and no tasks scheduled", () => {
    expect(isHomeConstructionStarted("2026-07-15", 0, today)).toBe(false)
  })

  it("handles legacy UTC-midnight start dates as the intended calendar day", () => {
    expect(isHomeConstructionStarted("2026-06-30T00:00:00.000Z", 0, today)).toBe(true)
  })
})

describe("getScheduleStatus", () => {
  it("returns not_started when start date is in the future and nothing scheduled", () => {
    expect(
      getScheduleStatus("2026-10-01", null, {
        startDate: "2026-08-01",
        scheduledTaskCount: 0,
      })
    ).toBe("not_started")
  })

  it("returns on_track when start date has passed even without scheduled tasks", () => {
    expect(
      getScheduleStatus("2026-10-19", null, {
        startDate: "2026-06-30",
        scheduledTaskCount: 0,
      })
    ).toBe("on_track")
  })
})
