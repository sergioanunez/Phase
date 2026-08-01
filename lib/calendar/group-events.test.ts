import { describe, it, expect } from "vitest"
import {
  formatDaySummary,
  formatWeekSummary,
  groupCalendarEventsByHouse,
  summarizeCalendarEvents,
  summarizeDayCalendarEvents,
} from "./group-events"

const base = {
  date: "2026-08-01",
  type: "trade" as const,
  status: "on_track" as const,
}

describe("groupCalendarEventsByHouse", () => {
  it("groups multiple tasks for the same house into one card", () => {
    const rows = groupCalendarEventsByHouse([
      {
        ...base,
        id: "t1",
        title: "Frame House",
        homeId: "h1",
        homeLabel: "14449 Leyland Parkway",
        communityName: "Verdancia",
        contractorName: "Mendoza Construction",
      },
      {
        ...base,
        id: "t2",
        title: "Plumbing Rough",
        homeId: "h1",
        homeLabel: "14449 Leyland Parkway",
        communityName: "Verdancia",
        contractorName: "Mendoza Construction",
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe("house")
    if (rows[0].kind === "house") {
      expect(rows[0].homeLabel).toBe("14449 Leyland Parkway")
      expect(rows[0].tasks.map((t) => t.title)).toEqual([
        "Frame House",
        "Plumbing Rough",
      ])
      expect(rows[0].contractorName).toBe("Mendoza Construction")
    }
  })

  it("collapses the same task across multiple houses", () => {
    const rows = groupCalendarEventsByHouse([
      {
        ...base,
        id: "a",
        title: "Footings",
        homeId: "h1",
        homeLabel: "14449 Leyland Parkway",
      },
      {
        ...base,
        id: "b",
        title: "Footings",
        homeId: "h2",
        homeLabel: "14460 Burwood Circle",
      },
      {
        ...base,
        id: "c",
        title: "Footings",
        homeId: "h3",
        homeLabel: "532 Basketflower Drive",
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe("task-homes")
    if (rows[0].kind === "task-homes") {
      expect(rows[0].title).toBe("Footings")
      expect(rows[0].homes).toHaveLength(3)
    }
  })

  it("keeps a single task as a house card", () => {
    const rows = groupCalendarEventsByHouse([
      {
        ...base,
        id: "t1",
        title: "Frame House",
        homeId: "h1",
        homeLabel: "14449 Leyland Parkway",
        communityName: "Verdancia Unit 1",
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe("house")
  })
})

describe("summarizeCalendarEvents", () => {
  it("counts unique houses, activities, and inspections (no deliveries)", () => {
    const summary = summarizeCalendarEvents([
      {
        ...base,
        id: "1",
        title: "A",
        homeId: "h1",
        homeLabel: "A",
        type: "trade",
      },
      {
        ...base,
        id: "2",
        title: "B",
        homeId: "h1",
        homeLabel: "A",
        type: "inspection",
      },
      {
        ...base,
        id: "3",
        title: "C",
        homeId: "h2",
        homeLabel: "B",
        type: "punchlist",
      },
    ])
    expect(summary).toEqual({
      houses: 2,
      scheduledActivities: 3,
      inspections: 1,
    })
    expect(formatWeekSummary(summary)).toBe(
      "2 Houses · 3 Scheduled Activities · 1 Inspection"
    )
  })
})

describe("formatDaySummary", () => {
  it("formats visits, inspections, and houses", () => {
    const summary = summarizeDayCalendarEvents([
      {
        ...base,
        id: "1",
        title: "A",
        homeId: "h1",
        homeLabel: "A",
        type: "trade",
      },
      {
        ...base,
        id: "2",
        title: "Insp",
        homeId: "h1",
        homeLabel: "A",
        type: "inspection",
      },
      {
        ...base,
        id: "3",
        title: "B",
        homeId: "h2",
        homeLabel: "B",
        type: "trade",
      },
    ])
    expect(formatDaySummary(summary)).toBe("3 Visits · 1 Inspection · 2 Houses")
  })
})
