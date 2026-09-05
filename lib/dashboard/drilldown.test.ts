import { describe, expect, it } from "vitest"
import { getScheduleStatus } from "@/lib/schedule-status"
import {
  computeCurrentPhaseForHome,
  computePhaseDistribution,
  deriveOrderedCategories,
  makeCategoryPhaseKey,
} from "@/lib/dashboard/phaseDistribution"
import { computePulseBySubdivision } from "@/lib/dashboard/pulse"
import {
  canOpenDrilldown,
  countsMatch,
  daysBehindForecast,
  filterDrilldownHouses,
  groupHomesByPhase,
  groupHomesByScheduleStatus,
  houseDetailsHref,
  parseInspectParam,
  selectNextCriticalIncompleteTask,
  serializeInspectParam,
  sortPortfolioHouses,
  type DrilldownHomeInput,
  type DrilldownTaskInput,
} from "@/lib/dashboard/drilldown"

function task(partial: Partial<DrilldownTaskInput> & { id: string; name: string }): DrilldownTaskInput {
  return {
    status: "Unscheduled",
    scheduledDate: null,
    completedAt: null,
    updatedAt: new Date("2026-08-01"),
    isCriticalPath: false,
    durationDaysSnapshot: 1,
    optionalCategory: "Foundation",
    sortOrder: 1,
    sequenceOrder: 100,
    isCriticalGate: false,
    ...partial,
  }
}

function home(partial: Partial<DrilldownHomeInput> & { id: string; addressOrLot: string }): DrilldownHomeInput {
  return {
    startDate: new Date("2026-06-01"),
    createdAt: new Date("2026-05-01"),
    displayOrder: 100,
    isComplete: false,
    forecastCompletionDate: new Date("2026-10-05"),
    targetCompletionDate: new Date("2026-12-10"),
    subdivision: { id: "sub-1", name: "Verdancia Unit 1 Phase 3" },
    tasks: [],
    ...partial,
  }
}

describe("dashboard drill-down — portfolio", () => {
  const notStarted = home({
    id: "ns",
    addressOrLot: "Not Started Ln",
    startDate: new Date("2026-12-01"),
    forecastCompletionDate: null,
    targetCompletionDate: null,
    tasks: [task({ id: "t-ns", name: "Mark Address", isCriticalGate: true })],
  })
  const onTrack = home({
    id: "ot",
    addressOrLot: "14452 Burwood Circle",
    tasks: [
      task({
        id: "t-ot",
        name: "Electrical Rough",
        status: "Scheduled",
        scheduledDate: new Date("2026-08-10"),
        isCriticalPath: true,
      }),
    ],
  })
  const atRisk = home({
    id: "ar",
    addressOrLot: "At Risk Ct",
    forecastCompletionDate: new Date("2026-10-12"),
    targetCompletionDate: new Date("2026-10-10"),
    tasks: [
      task({
        id: "t-ar",
        name: "HVAC Rough",
        status: "Scheduled",
        scheduledDate: new Date("2026-08-10"),
        isCriticalPath: true,
      }),
    ],
  })
  const behind = home({
    id: "bh",
    addressOrLot: "14460 Burwood Circle",
    forecastCompletionDate: new Date("2026-10-24"),
    targetCompletionDate: new Date("2026-10-10"),
    displayOrder: 50,
    tasks: [
      task({
        id: "t-bh",
        name: "Plumbing Top-Out",
        status: "Scheduled",
        scheduledDate: new Date("2026-08-10"),
        isCriticalGate: true,
      }),
    ],
  })
  const homes = [notStarted, onTrack, atRisk, behind]

  it("Not Started opens exact matching houses", () => {
    const grouped = groupHomesByScheduleStatus(homes)
    expect(grouped.not_started.map((h) => h.homeId)).toEqual(["ns"])
    expect(grouped.not_started[0]!.nextCriticalTaskName).toBe("Mark Address")
  })

  it("On Track opens exact matching houses", () => {
    const grouped = groupHomesByScheduleStatus(homes)
    expect(grouped.on_track.map((h) => h.homeId)).toEqual(["ot"])
    expect(grouped.on_track[0]!.nextCriticalTaskName).toBe("Electrical Rough")
  })

  it("At Risk opens exact matching houses", () => {
    const grouped = groupHomesByScheduleStatus(homes)
    expect(grouped.at_risk.map((h) => h.homeId)).toEqual(["ar"])
    expect(grouped.at_risk[0]!.daysBehind).toBe(2)
  })

  it("Behind opens exact matching houses", () => {
    const grouped = groupHomesByScheduleStatus(homes)
    expect(grouped.behind.map((h) => h.homeId)).toEqual(["bh"])
    expect(grouped.behind[0]!.daysBehind).toBe(14)
    expect(grouped.behind[0]!.nextCriticalTaskName).toBe("Plumbing Top-Out")
  })

  it("zero-count metric does not open unnecessary drawer", () => {
    expect(canOpenDrilldown(0)).toBe(false)
    expect(canOpenDrilldown(7)).toBe(true)
  })

  it("counts match Portfolio Overview / getScheduleStatus", () => {
    const grouped = groupHomesByScheduleStatus(homes)
    for (const h of homes) {
      const scheduledTaskCount = h.tasks.filter((t) => t.scheduledDate != null).length
      const status = getScheduleStatus(
        h.forecastCompletionDate?.toISOString() ?? null,
        h.targetCompletionDate?.toISOString() ?? null,
        {
          startDate: h.startDate,
          scheduledTaskCount,
          isComplete: h.isComplete,
        }
      )
      expect(grouped[status].some((row) => row.homeId === h.id)).toBe(true)
    }
  })

  it("completed homes are not classified as Behind", () => {
    const done = home({
      id: "done",
      addressOrLot: "Done Ln",
      isComplete: true,
      forecastCompletionDate: new Date("2026-10-24"),
      targetCompletionDate: new Date("2026-10-10"),
      tasks: [
        task({
          id: "t-done",
          name: "Final",
          status: "Completed",
          scheduledDate: new Date("2026-08-01"),
          completedAt: new Date("2026-08-24"),
        }),
      ],
    })
    const grouped = groupHomesByScheduleStatus([done, behind])
    expect(grouped.completed.map((h) => h.homeId)).toEqual(["done"])
    expect(grouped.behind.map((h) => h.homeId)).toEqual(["bh"])
    expect(grouped.behind.every((h) => h.homeId !== "done")).toBe(true)
  })

  it("sorts Behind most-behind first", () => {
    const mild = home({
      id: "mild",
      addressOrLot: "Mild",
      forecastCompletionDate: new Date("2026-10-18"),
      targetCompletionDate: new Date("2026-10-10"),
      tasks: [task({ id: "tm", name: "X", scheduledDate: new Date("2026-08-01"), status: "Scheduled" })],
    })
    const rows = sortPortfolioHouses(
      groupHomesByScheduleStatus([behind, mild]).behind,
      "behind"
    )
    expect(rows.map((r) => r.homeId)).toEqual(["bh", "mild"])
  })
})

describe("dashboard drill-down — construction timeline", () => {
  const foundationHome = home({
    id: "f1",
    addressOrLot: "14460 Burwood Circle",
    tasks: [
      task({
        id: "plumb",
        name: "Plumbing Rough",
        optionalCategory: "Foundation",
        status: "InProgress",
        scheduledDate: new Date("2026-08-10"),
        isCriticalGate: true,
        sequenceOrder: 200,
      }),
      task({
        id: "frame",
        name: "Frame House",
        optionalCategory: "Structural",
        status: "Unscheduled",
        isCriticalPath: true,
        sequenceOrder: 300,
      }),
    ],
  })
  const structuralHome = home({
    id: "s1",
    addressOrLot: "14500 Burwood Circle",
    displayOrder: 200,
    tasks: [
      task({
        id: "foot",
        name: "Footings",
        optionalCategory: "Foundation",
        status: "Completed",
        scheduledDate: new Date("2026-07-01"),
        completedAt: new Date("2026-07-02"),
        isCriticalGate: true,
        sequenceOrder: 100,
      }),
      task({
        id: "frame2",
        name: "Frame House",
        optionalCategory: "Structural",
        status: "InProgress",
        scheduledDate: new Date("2026-08-11"),
        isCriticalPath: true,
        sequenceOrder: 300,
      }),
    ],
  })
  const customCatHome = home({
    id: "c1",
    addressOrLot: "Custom",
    tasks: [
      task({
        id: "solar",
        name: "Solar Rough",
        optionalCategory: "Builder Custom MEP",
        status: "Scheduled",
        scheduledDate: new Date("2026-08-12"),
        isCriticalPath: true,
      }),
    ],
  })

  const set = [foundationHome, structuralHome, customCatHome]

  it("each configured stage is represented and interactive (count > 0)", () => {
    const dist = computePhaseDistribution(set.map(toPhase))
    expect(dist.phases.every((p) => p.count > 0)).toBe(true)
    expect(dist.phases.every((p) => canOpenDrilldown(p.count))).toBe(true)
  })

  it("Foundation returns exact Foundation homes", () => {
    const grouped = groupHomesByPhase(set)
    const key = makeCategoryPhaseKey("Foundation")
    expect(grouped.get(key)?.homes.map((h) => h.homeId)).toEqual(["f1"])
    expect(grouped.get(key)?.homes[0]!.nextCriticalTaskName).toBe("Plumbing Rough")
  })

  it("Structural returns exact Structural homes", () => {
    const grouped = groupHomesByPhase(set)
    const key = makeCategoryPhaseKey("Structural")
    expect(grouped.get(key)?.homes.map((h) => h.homeId)).toEqual(["s1"])
  })

  it("dynamic/custom builder categories work", () => {
    const grouped = groupHomesByPhase(set)
    const key = makeCategoryPhaseKey("Builder Custom MEP")
    expect(grouped.get(key)?.homes.map((h) => h.homeId)).toEqual(["c1"])
  })

  it("stage counts match Dashboard computePhaseDistribution", () => {
    const dist = computePhaseDistribution(set.map(toPhase))
    const grouped = groupHomesByPhase(set)
    for (const phase of dist.phases) {
      expect(countsMatch(phase.count, grouped.get(phase.key)?.homes ?? [])).toBe(true)
      const fromCompute = set.filter(
        (h, i) => computeCurrentPhaseForHome(toPhase(set[i]!), deriveOrderedCategories(set.map(toPhase))).key === phase.key
      )
      expect(fromCompute.map((h) => h.id).sort()).toEqual(
        (grouped.get(phase.key)?.homes.map((h) => h.homeId) ?? []).sort()
      )
    }
  })

  it("house rows show current critical task context", () => {
    const row = groupHomesByPhase([foundationHome]).get(makeCategoryPhaseKey("Foundation"))!.homes[0]!
    expect(row.nextCriticalTaskId).toBe("plumb")
    expect(row.forecastDate).toBeTruthy()
  })
})

function toPhase(h: DrilldownHomeInput) {
  return {
    id: h.id,
    addressOrLot: h.addressOrLot,
    startDate: h.startDate,
    createdAt: h.createdAt,
    isComplete: h.isComplete,
    forecastCompletionDate: h.forecastCompletionDate,
    tasks: h.tasks.map((t) => ({
      id: t.id,
      status: t.status,
      scheduledDate: t.scheduledDate,
      templateItem: {
        name: t.name,
        optionalCategory: t.optionalCategory,
        sortOrder: t.sortOrder,
        sequenceOrder: t.sequenceOrder,
      },
    })),
  }
}

function toPulseHome(h: DrilldownHomeInput) {
  return {
    id: h.id,
    addressOrLot: h.addressOrLot,
    startDate: h.startDate,
    createdAt: h.createdAt,
    isComplete: h.isComplete,
    subdivision: h.subdivision,
    tasks: h.tasks.map((t) => ({
      id: t.id,
      status: t.status,
      scheduledDate: t.scheduledDate,
      completedAt: t.completedAt,
      updatedAt: t.updatedAt ?? new Date("2026-08-01"),
      isCriticalPath: t.isCriticalPath,
      durationDaysSnapshot: t.durationDaysSnapshot,
      templateItem: { name: t.name, isCriticalGate: t.isCriticalGate },
    })),
  }
}

describe("dashboard drill-down — field pulse", () => {
  const homes = [
    home({
      id: "p1",
      addressOrLot: "14480 Burwood Circle",
      subdivision: { id: "ph2", name: "Verdancia Unit 1 Phase 2" },
      tasks: [
        task({
          id: "slab",
          name: "Pour Slab",
          status: "Completed",
          completedAt: new Date("2026-08-12"),
          isCriticalGate: true,
        }),
        task({
          id: "frame",
          name: "Frame House",
          status: "Unscheduled",
          isCriticalPath: true,
          sequenceOrder: 400,
        }),
      ],
    }),
    home({
      id: "p2",
      addressOrLot: "Other Sub",
      subdivision: { id: "ph1", name: "Verdancia Unit 1 Phase 1" },
      tasks: [
        task({
          id: "form",
          name: "Form Layout",
          status: "Completed",
          completedAt: new Date("2026-08-01"),
          isCriticalGate: true,
        }),
      ],
    }),
  ]

  it("Field Pulse subdivision row opens exact represented homes", () => {
    const pulse = computePulseBySubdivision(homes.map(toPulseHome))
    const phase2 = pulse.find((g) => g.subdivisionId === "ph2")!
    expect(phase2.homes.map((h) => h.homeId)).toEqual(["p1"])
    expect(phase2.homes.length).toBe(1)
  })

  it("counts match Field Pulse groups", () => {
    const pulse = computePulseBySubdivision(homes.map(toPulseHome))
    expect(pulse.find((g) => g.subdivisionId === "ph2")!.homes).toHaveLength(1)
    expect(pulse.find((g) => g.subdivisionId === "ph1")!.homes).toHaveLength(1)
  })

  it("last milestone information displays correctly", () => {
    const pulse = computePulseBySubdivision(homes.map(toPulseHome))
    const row = pulse.find((g) => g.subdivisionId === "ph2")!.homes[0]!
    expect(row.lastCriticalTaskName).toBe("Pour Slab")
    expect(row.lastCriticalTaskId).toBe("slab")
    expect(row.lastCriticalCompletedAt).toContain("2026-08-12")
  })

  it("multiple Field Pulse subdivisions remain isolated", () => {
    const pulse = computePulseBySubdivision(homes.map(toPulseHome))
    expect(pulse).toHaveLength(2)
    expect(pulse.find((g) => g.subdivisionId === "ph2")!.homes.some((h) => h.homeId === "p2")).toBe(
      false
    )
  })
})

describe("dashboard drill-down — general", () => {
  it("house tap href opens House Details", () => {
    expect(houseDetailsHref("abc")).toBe("/homes/abc")
  })

  it("task deep-link works where context exists", () => {
    expect(houseDetailsHref("abc", "task-1")).toBe("/homes/abc?task=task-1&highlight=1")
  })

  it("inspect param round-trips for restore on Dashboard", () => {
    expect(serializeInspectParam({ kind: "portfolio", status: "behind", title: "Behind" })).toBe(
      "status:behind"
    )
    expect(parseInspectParam("status:behind")).toEqual({ kind: "portfolio", key: "behind" })
    expect(parseInspectParam("phase:category:Foundation")).toEqual({
      kind: "timeline",
      key: "category:Foundation",
    })
    expect(parseInspectParam("pulse:sub-9")).toEqual({ kind: "pulse", key: "sub-9" })
  })

  it("search filters by address and subdivision", () => {
    const rows = [
      {
        homeId: "1",
        address: "14460 Burwood Circle",
        subdivisionName: "Verdancia Unit 1 Phase 3",
        startDate: null,
        forecastDate: null,
        targetDate: null,
        daysBehind: null,
        nextCriticalTaskId: null,
        nextCriticalTaskName: null,
        lastMilestoneTaskId: null,
        lastMilestoneName: null,
        lastMilestoneCompletedAt: null,
        displayOrder: 1,
      },
      {
        homeId: "2",
        address: "Other",
        subdivisionName: "Lakeside",
        startDate: null,
        forecastDate: null,
        targetDate: null,
        daysBehind: null,
        nextCriticalTaskId: null,
        nextCriticalTaskName: null,
        lastMilestoneTaskId: null,
        lastMilestoneName: null,
        lastMilestoneCompletedAt: null,
        displayOrder: 2,
      },
    ]
    expect(filterDrilldownHouses(rows, "burwood").map((h) => h.homeId)).toEqual(["1"])
    expect(filterDrilldownHouses(rows, "lakeside").map((h) => h.homeId)).toEqual(["2"])
  })

  it("daysBehind uses forecast vs target calendar days", () => {
    expect(daysBehindForecast("2026-10-24", "2026-10-10")).toBe(14)
    expect(daysBehindForecast("2026-10-05", "2026-12-10")).toBeNull()
  })

  it("selectNextCriticalIncompleteTask skips completed milestones", () => {
    const next = selectNextCriticalIncompleteTask([
      task({
        id: "done",
        name: "Pour Slab",
        status: "Completed",
        isCriticalGate: true,
        sequenceOrder: 100,
      }),
      task({
        id: "next",
        name: "Frame House",
        status: "Unscheduled",
        isCriticalPath: true,
        sequenceOrder: 200,
      }),
    ])
    expect(next).toEqual({ taskId: "next", taskName: "Frame House" })
  })
})
