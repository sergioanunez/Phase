import { describe, expect, it } from "vitest"
import { applyGapMarkers, buildHouseScheduleStrip, type HouseScheduleDayCell } from "./house-schedule-strip"

describe("buildHouseScheduleStrip", () => {
  const today = new Date(2026, 4, 27) // Wed May 27 2026

  it("groups tasks by scheduled date", () => {
    const strip = buildHouseScheduleStrip(
      [
        {
          id: "1",
          nameSnapshot: "Framing",
          status: "Scheduled",
          scheduledDate: "2026-05-27T12:00:00.000Z",
          completedAt: null,
        },
        {
          id: "2",
          nameSnapshot: "Drywall",
          status: "Scheduled",
          scheduledDate: "2026-05-29T12:00:00.000Z",
          completedAt: null,
        },
      ],
      { weekCount: 2, today }
    )
    expect(strip.hasAnyScheduled).toBe(true)
    const wed = strip.days.find((d) => d.dateKey === "2026-05-27")
    const fri = strip.days.find((d) => d.dateKey === "2026-05-29")
    expect(wed?.scheduledCount).toBe(1)
    expect(fri?.scheduledCount).toBe(1)
  })

  it("marks overdue tasks on past scheduled days", () => {
    const strip = buildHouseScheduleStrip(
      [
        {
          id: "1",
          nameSnapshot: "Late task",
          status: "Scheduled",
          scheduledDate: "2026-05-26T12:00:00.000Z",
          completedAt: null,
        },
      ],
      { weekCount: 2, today }
    )
    const tue = strip.days.find((d) => d.dateKey === "2026-05-26")
    expect(tue?.hasOverdue).toBe(true)
  })
})

describe("applyGapMarkers", () => {
  it("flags a 2-day working gap between scheduled days", () => {
    const days: HouseScheduleDayCell[] = [
      makeCell("2026-05-27", 1, true),
      makeCell("2026-05-28", 0, true),
      makeCell("2026-05-29", 0, true),
      makeCell("2026-05-30", 1, true),
    ]
    applyGapMarkers(days)
    expect(days[1]?.isGapDay).toBe(true)
    expect(days[2]?.isGapDay).toBe(true)
    expect(days[1]?.gapLabel).toBe("2-day gap")
  })

  it("ignores weekends in gap runs", () => {
    const days: HouseScheduleDayCell[] = [
      makeCell("2026-05-29", 1, true), // Fri
      makeCell("2026-05-30", 0, false), // Sat
      makeCell("2026-05-31", 0, false), // Sun
      makeCell("2026-06-01", 0, true), // Mon empty
      makeCell("2026-06-02", 1, true), // Tue
    ]
    applyGapMarkers(days)
    expect(days[3]?.isGapDay).toBe(false)
  })
})

function makeCell(
  dateKey: string,
  scheduledCount: number,
  isWorkingDayFlag: boolean
): HouseScheduleDayCell {
  const [y, m, d] = dateKey.split("-").map(Number)
  const date = new Date(y!, m! - 1, d!)
  return {
    date,
    dateKey,
    dayLabel: "Mon",
    dateNumber: String(d),
    isWeekend: !isWorkingDayFlag,
    isToday: false,
    isWorkingDay: isWorkingDayFlag,
    tasks: [],
    scheduledCount,
    hasOverdue: false,
    allCompleted: false,
    isGapDay: false,
    gapLabel: null,
  }
}
