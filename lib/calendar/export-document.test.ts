import { describe, expect, it } from "vitest"
import {
  buildCalendarExportHtml,
  filterActivitiesByContractor,
  filterActivitiesInRange,
  groupExportActivities,
  summarizeExportDocument,
  type CalendarExportActivity,
} from "./export-document"
import {
  formatExportRangeLabel,
  productionScheduleTitle,
  resolveCalendarExportRange,
  toExportQueryDate,
} from "./export-range"

const monday = new Date("2026-08-10T12:00:00")

function act(
  partial: Partial<CalendarExportActivity> & { id: string; date: string; title: string }
): CalendarExportActivity {
  return {
    homeLabel: "14480 Burwood Circle",
    communityName: "Verdancia Unit 1 Phase 2",
    ...partial,
  }
}

describe("resolveCalendarExportRange", () => {
  it("resolves next 30 days inclusively from today", () => {
    const r = resolveCalendarExportRange({ preset: "30", today: monday })
    expect("error" in r).toBe(false)
    if ("error" in r) return
    expect(toExportQueryDate(r.start)).toBe("2026-08-10")
    expect(toExportQueryDate(r.end)).toBe("2026-09-08")
    expect(r.labelDays).toBe(30)
    expect(productionScheduleTitle(r.preset, r.labelDays)).toBe("30-Day Production Schedule")
  })

  it("resolves 60 and 90 day presets", () => {
    const d60 = resolveCalendarExportRange({ preset: "60", today: monday })
    const d90 = resolveCalendarExportRange({ preset: "90", today: monday })
    expect("error" in d60).toBe(false)
    expect("error" in d90).toBe(false)
    if ("error" in d60 || "error" in d90) return
    expect(d60.labelDays).toBe(60)
    expect(d90.labelDays).toBe(90)
    expect(toExportQueryDate(d60.end)).toBe("2026-10-08")
    expect(toExportQueryDate(d90.end)).toBe("2026-11-07")
  })

  it("supports custom range", () => {
    const r = resolveCalendarExportRange({
      preset: "custom",
      customStart: "2026-08-12",
      customEnd: "2026-11-10",
    })
    expect("error" in r).toBe(false)
    if ("error" in r) return
    expect(formatExportRangeLabel(r.start, r.end)).toBe("Aug 12, 2026 – Nov 10, 2026")
    expect(productionScheduleTitle(r.preset, r.labelDays)).toBe("Production Schedule")
  })

  it("rejects inverted custom range", () => {
    const r = resolveCalendarExportRange({
      preset: "custom",
      customStart: "2026-11-10",
      customEnd: "2026-08-12",
    })
    expect("error" in r).toBe(true)
  })
})

describe("calendar export grouping and filtering", () => {
  const activities: CalendarExportActivity[] = [
    act({
      id: "1",
      date: "2026-08-17",
      title: "Plumbing Rough",
      contractorId: "c1",
      contractorName: "Carrete Plumbing",
      durationDays: 3,
    }),
    act({
      id: "2",
      date: "2026-08-17",
      title: "HVAC Rough",
      homeLabel: "14480 Burwood Circle",
      contractorId: "c2",
      contractorName: "ABC Mechanical",
    }),
    act({
      id: "3",
      date: "2026-08-19",
      title: "Plumbing Top-Out",
      homeLabel: "14449 Leyland Parkway",
      contractorId: "c1",
      contractorName: "Carrete Plumbing",
    }),
    act({
      id: "4",
      date: "2026-12-01",
      title: "Outside range",
      contractorId: "c1",
      contractorName: "Carrete Plumbing",
    }),
  ]

  it("filters by date range", () => {
    const start = new Date("2026-08-12T12:00:00")
    const end = new Date("2026-11-10T12:00:00")
    const filtered = filterActivitiesInRange(activities, start, end)
    expect(filtered.map((a) => a.id)).toEqual(["1", "2", "3"])
  })

  it("filters single contractor and excludes other trades", () => {
    const filtered = filterActivitiesByContractor(activities, "c1")
    expect(filtered.every((a) => a.contractorId === "c1")).toBe(true)
    expect(filtered.map((a) => a.id)).toEqual(["1", "3", "4"])
  })

  it("groups multiple activities at same house/date", () => {
    const inRange = filterActivitiesInRange(
      activities,
      new Date("2026-08-01"),
      new Date("2026-09-01")
    )
    const days = groupExportActivities(inRange)
    expect(days[0]!.dayHeading).toMatch(/MONDAY/)
    expect(days[0]!.houses[0]!.activities.map((a) => a.title)).toEqual([
      "HVAC Rough",
      "Plumbing Rough",
    ])
  })

  it("summarizes houses and activities", () => {
    const s = summarizeExportDocument({
      activities: filterActivitiesByContractor(activities, "c1").filter((a) => a.id !== "4"),
    })
    expect(s.activityCount).toBe(2)
    expect(s.houseCount).toBe(2)
  })

  it("empty contractor period produces empty-state HTML", () => {
    const html = buildCalendarExportHtml({
      activities: [],
      rangeStart: new Date("2026-08-12"),
      rangeEnd: new Date("2026-11-10"),
      preset: "90",
      labelDays: 90,
      scope: "contractor",
      contractorName: "Carrete Plumbing",
      companyName: "Acme Homes",
    })
    expect(html).toMatch(/No scheduled work for Carrete Plumbing/)
    expect(html).toMatch(/90-Day Production Schedule/)
  })

  it("all-activities HTML includes contractor names", () => {
    const html = buildCalendarExportHtml({
      activities: filterActivitiesInRange(
        activities,
        new Date("2026-08-01"),
        new Date("2026-09-01")
      ),
      rangeStart: new Date("2026-08-01"),
      rangeEnd: new Date("2026-09-01"),
      preset: "30",
      labelDays: 30,
      scope: "all",
      contractorName: null,
      companyName: "Acme Homes",
    })
    expect(html).toMatch(/Carrete Plumbing/)
    expect(html).toMatch(/ABC Mechanical/)
    expect(html).toMatch(/14480 Burwood Circle/)
  })

  it("contractor HTML omits other trades and is mutation-free (pure)", () => {
    const source = [...activities]
    const html = buildCalendarExportHtml({
      activities: filterActivitiesByContractor(source, "c1"),
      rangeStart: new Date("2026-08-01"),
      rangeEnd: new Date("2026-09-01"),
      preset: "60",
      labelDays: 60,
      scope: "contractor",
      contractorName: "Carrete Plumbing",
      companyName: "Acme Homes",
    })
    expect(html).toMatch(/Carrete Plumbing/)
    expect(html).not.toMatch(/ABC Mechanical/)
    expect(source).toHaveLength(activities.length)
  })

  it("prefill filter helper keeps contractor id matching Calendar filter", () => {
    const prefilledId = "c1"
    const scoped = filterActivitiesByContractor(activities, prefilledId)
    expect(scoped.every((a) => a.contractorId === prefilledId)).toBe(true)
  })
})
