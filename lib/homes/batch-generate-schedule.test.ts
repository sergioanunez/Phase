import { describe, expect, it } from "vitest"
import { buildBatchSchedulePreview } from "./batch-generate-schedule"
import { computeStaggeredAnchorDate } from "./batch-generate-wizard"
import {
  buildSchedulePreview,
  computeTasksFingerprint,
  findUnscheduledExternalPredecessor,
  proposalsToScheduledDates,
  taskMatchesCategory,
  type ScheduleTaskInput,
} from "./generate-schedule"

function task(
  partial: Partial<ScheduleTaskInput> & {
    id: string
    templateItemId: string
    nameSnapshot: string
  }
): ScheduleTaskInput {
  return {
    durationDaysSnapshot: 1,
    status: "Unscheduled",
    scheduledDate: null,
    completedAt: null,
    isCriticalPath: false,
    templateItem: { optionalCategory: "Foundation", isCriticalGate: false },
    contractorId: null,
    contractor: null,
    ...partial,
  }
}

const monday = new Date("2026-08-10T12:00:00") // Monday

describe("computeStaggeredAnchorDate", () => {
  it("0-day stagger keeps the same working-day anchor", () => {
    const a0 = computeStaggeredAnchorDate(monday, 0, 0)
    const a1 = computeStaggeredAnchorDate(monday, 1, 0)
    expect(a0.toISOString().slice(0, 10)).toBe("2026-08-10")
    expect(a1.toISOString().slice(0, 10)).toBe("2026-08-10")
  })

  it("1-day stagger advances one working day per house", () => {
    expect(computeStaggeredAnchorDate(monday, 0, 1).toISOString().slice(0, 10)).toBe(
      "2026-08-10"
    )
    expect(computeStaggeredAnchorDate(monday, 1, 1).toISOString().slice(0, 10)).toBe(
      "2026-08-11"
    )
    expect(computeStaggeredAnchorDate(monday, 2, 1).toISOString().slice(0, 10)).toBe(
      "2026-08-12"
    )
  })

  it("2-day stagger skips weekend when advancing", () => {
    // House 0 Mon 10, House 1 Wed 12, House 2 Fri 14, House 3 Tue 18
    expect(computeStaggeredAnchorDate(monday, 0, 2).toISOString().slice(0, 10)).toBe(
      "2026-08-10"
    )
    expect(computeStaggeredAnchorDate(monday, 1, 2).toISOString().slice(0, 10)).toBe(
      "2026-08-12"
    )
    expect(computeStaggeredAnchorDate(monday, 2, 2).toISOString().slice(0, 10)).toBe(
      "2026-08-14"
    )
    expect(computeStaggeredAnchorDate(monday, 3, 2).toISOString().slice(0, 10)).toBe(
      "2026-08-18"
    )
  })
})

describe("buildBatchSchedulePreview", () => {
  const makeHouse = (id: string, address: string) => ({
    homeId: id,
    addressOrLot: address,
    startDate: monday,
    tasks: [
      task({
        id: `${id}-t1`,
        templateItemId: "tpl-form",
        nameSnapshot: "Form Layout",
        templateItem: { optionalCategory: "Foundation", isCriticalGate: true },
        isCriticalPath: true,
      }),
      task({
        id: `${id}-t2`,
        templateItemId: "tpl-frame",
        nameSnapshot: "Frame House",
        templateItem: { optionalCategory: "Structural", isCriticalGate: true },
        isCriticalPath: true,
      }),
    ],
  })

  it("uses manual selected-house order for stagger", () => {
    const batch = buildBatchSchedulePreview({
      housesInOrder: [
        makeHouse("h2", "14456 Burwood"),
        makeHouse("h1", "14460 Burwood"),
      ],
      templateDeps: [],
      baseAnchorDate: monday,
      staggerWorkingDays: 2,
      mode: "all",
    })
    expect(batch.homes[0]!.addressOrLot).toBe("14456 Burwood")
    expect(batch.homes[0]!.anchorDate.slice(0, 10)).toBe("2026-08-10")
    expect(batch.homes[1]!.anchorDate.slice(0, 10)).toBe("2026-08-12")
  })

  it("supports all-categories generation", () => {
    const batch = buildBatchSchedulePreview({
      housesInOrder: [makeHouse("h1", "A")],
      templateDeps: [],
      baseAnchorDate: monday,
      staggerWorkingDays: 0,
      mode: "all",
      category: null,
    })
    expect(batch.categoryLabel).toBe("All categories")
    expect(batch.homes[0]!.preview.proposedCount).toBe(2)
  })

  it("scopes one category and does not propose other categories", () => {
    const batch = buildBatchSchedulePreview({
      housesInOrder: [makeHouse("h1", "A")],
      templateDeps: [],
      baseAnchorDate: monday,
      staggerWorkingDays: 0,
      mode: "all",
      category: "Foundation",
    })
    expect(batch.category).toBe("Foundation")
    const rows = batch.homes[0]!.preview.rows
    expect(rows.every((r) => r.category === "Foundation")).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.taskName).toBe("Form Layout")
  })

  it("critical-only + category", () => {
    const house = makeHouse("h1", "A")
    house.tasks[0]!.isCriticalPath = true
    house.tasks[1]!.isCriticalPath = false
    house.tasks[1]!.templateItem = {
      optionalCategory: "Foundation",
      isCriticalGate: false,
    }
    const batch = buildBatchSchedulePreview({
      housesInOrder: [house],
      templateDeps: [],
      baseAnchorDate: monday,
      staggerWorkingDays: 0,
      mode: "critical",
      category: "Foundation",
    })
    expect(batch.homes[0]!.preview.rows.map((r) => r.taskId)).toEqual(["h1-t1"])
  })

  it("excludes completed and N/A tasks", () => {
    const batch = buildBatchSchedulePreview({
      housesInOrder: [
        {
          homeId: "h1",
          addressOrLot: "A",
          startDate: monday,
          tasks: [
            task({
              id: "done",
              templateItemId: "a",
              nameSnapshot: "Done",
              status: "Completed",
              completedAt: monday,
            }),
            task({
              id: "na",
              templateItemId: "b",
              nameSnapshot: "NA",
              status: "NotApplicable",
            }),
            task({
              id: "open",
              templateItemId: "c",
              nameSnapshot: "Open",
              isCriticalPath: true,
              templateItem: { optionalCategory: "Foundation", isCriticalGate: true },
            }),
          ],
        },
      ],
      templateDeps: [],
      baseAnchorDate: monday,
      staggerWorkingDays: 0,
      mode: "all",
    })
    expect(batch.homes[0]!.preview.rows.map((r) => r.taskId)).toEqual(["open"])
    expect(batch.homes[0]!.preview.completedSkipped).toBe(1)
  })

  it("respect existing ON preserves scheduled dates in proposals apply set", () => {
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [
        task({
          id: "s1",
          templateItemId: "a",
          nameSnapshot: "Scheduled",
          status: "Scheduled",
          scheduledDate: new Date("2026-07-10T12:00:00"),
        }),
        task({
          id: "u1",
          templateItemId: "b",
          nameSnapshot: "Open",
        }),
      ],
      templateDeps: [],
      anchorDate: monday,
      mode: "all",
      respectExistingScheduledDates: true,
    })
    const apply = proposalsToScheduledDates(preview)
    expect(apply.map((p) => p.taskId)).toEqual(["u1"])
  })

  it("respect OFF + category only regenerates selected category", () => {
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [
        task({
          id: "f1",
          templateItemId: "f",
          nameSnapshot: "Footings",
          status: "Scheduled",
          scheduledDate: new Date("2026-07-01T12:00:00"),
          templateItem: { optionalCategory: "Foundation", isCriticalGate: true },
        }),
        task({
          id: "s1",
          templateItemId: "s",
          nameSnapshot: "Frame",
          status: "Scheduled",
          scheduledDate: new Date("2026-07-15T12:00:00"),
          templateItem: { optionalCategory: "Structural", isCriticalGate: true },
        }),
      ],
      templateDeps: [],
      anchorDate: monday,
      mode: "all",
      respectExistingScheduledDates: false,
      category: "Foundation",
    })
    const apply = proposalsToScheduledDates(preview)
    expect(apply.map((p) => p.taskId)).toEqual(["f1"])
    expect(apply[0]!.scheduledDate.toISOString().slice(0, 10)).toBe("2026-08-10")
  })

  it("flags unscheduled external dependency as blocked", () => {
    const foundation = task({
      id: "f1",
      templateItemId: "tpl-f",
      nameSnapshot: "Footings",
      templateItem: { optionalCategory: "Foundation", isCriticalGate: true },
    })
    const frame = task({
      id: "s1",
      templateItemId: "tpl-s",
      nameSnapshot: "Frame House",
      templateItem: { optionalCategory: "Structural", isCriticalGate: true },
    })
    // Footings depends on Frame (outside category) which is unscheduled
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [foundation, frame],
      templateDeps: [{ templateItemId: "tpl-f", dependsOnItemId: "tpl-s" }],
      anchorDate: monday,
      mode: "all",
      category: "Foundation",
    })
    expect(preview.blockedCount).toBe(1)
    expect(preview.rows[0]!.blocked).toBe(true)
    expect(preview.rows[0]!.blockedReason).toMatch(/Frame House/)
    expect(proposalsToScheduledDates(preview)).toHaveLength(0)
  })

  it("allows category task when external predecessor is completed", () => {
    const foundation = task({
      id: "f1",
      templateItemId: "tpl-f",
      nameSnapshot: "Footings",
      templateItem: { optionalCategory: "Foundation", isCriticalGate: true },
    })
    const frame = task({
      id: "s1",
      templateItemId: "tpl-s",
      nameSnapshot: "Frame House",
      status: "Completed",
      completedAt: monday,
      templateItem: { optionalCategory: "Structural", isCriticalGate: true },
    })
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [foundation, frame],
      templateDeps: [{ templateItemId: "tpl-f", dependsOnItemId: "tpl-s" }],
      anchorDate: monday,
      mode: "all",
      category: "Foundation",
    })
    expect(preview.blockedCount).toBe(0)
    expect(preview.proposedCount).toBe(1)
  })

  it("allows category task when external predecessor is already scheduled", () => {
    const foundation = task({
      id: "f1",
      templateItemId: "tpl-f",
      nameSnapshot: "Footings",
      templateItem: { optionalCategory: "Foundation", isCriticalGate: true },
    })
    const frame = task({
      id: "s1",
      templateItemId: "tpl-s",
      nameSnapshot: "Frame House",
      status: "Scheduled",
      scheduledDate: new Date("2026-08-11T12:00:00"),
      templateItem: { optionalCategory: "Structural", isCriticalGate: true },
    })
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [foundation, frame],
      templateDeps: [{ templateItemId: "tpl-f", dependsOnItemId: "tpl-s" }],
      anchorDate: monday,
      mode: "all",
      category: "Foundation",
    })
    expect(preview.blockedCount).toBe(0)
    expect(preview.proposedCount).toBe(1)
  })

  it("reports house with no tasks in selected category", () => {
    const batch = buildBatchSchedulePreview({
      housesInOrder: [
        {
          homeId: "h1",
          addressOrLot: "A",
          startDate: monday,
          tasks: [
            task({
              id: "s1",
              templateItemId: "s",
              nameSnapshot: "Frame",
              templateItem: { optionalCategory: "Structural", isCriticalGate: true },
            }),
          ],
        },
      ],
      templateDeps: [],
      baseAnchorDate: monday,
      staggerWorkingDays: 0,
      mode: "all",
      category: "Foundation",
    })
    expect(batch.homes[0]!.needsReview).toBe(true)
    expect(batch.homes[0]!.preview.error).toMatch(/Foundation/)
  })

  it("fingerprint changes when scheduled dates change (stale detection)", () => {
    const a = [
      task({ id: "1", templateItemId: "a", nameSnapshot: "A", scheduledDate: null }),
    ]
    const b = [
      task({
        id: "1",
        templateItemId: "a",
        nameSnapshot: "A",
        status: "Scheduled",
        scheduledDate: monday,
      }),
    ]
    expect(computeTasksFingerprint(a)).not.toBe(computeTasksFingerprint(b))
  })

  it("taskMatchesCategory uses tenant optionalCategory names", () => {
    const t = task({
      id: "1",
      templateItemId: "a",
      nameSnapshot: "X",
      templateItem: {
        optionalCategory: "Interior finishes / exterior rough work",
        isCriticalGate: false,
      },
    })
    expect(taskMatchesCategory(t, "Interior finishes / exterior rough work")).toBe(true)
    expect(taskMatchesCategory(t, "Foundation")).toBe(false)
    expect(taskMatchesCategory(t, null)).toBe(true)
  })

  it("findUnscheduledExternalPredecessor returns the blocking task", () => {
    const f = task({
      id: "f",
      templateItemId: "tpl-f",
      nameSnapshot: "Footings",
      templateItem: { optionalCategory: "Foundation", isCriticalGate: false },
    })
    const s = task({
      id: "s",
      templateItemId: "tpl-s",
      nameSnapshot: "Frame",
      templateItem: { optionalCategory: "Structural", isCriticalGate: false },
    })
    const map = new Map([
      ["tpl-f", f],
      ["tpl-s", s],
    ])
    const blocker = findUnscheduledExternalPredecessor(
      f,
      map,
      [{ templateItemId: "tpl-f", dependsOnItemId: "tpl-s" }],
      "Foundation"
    )
    expect(blocker?.id).toBe("s")
  })
})

describe("contractor-scoped batch generation", () => {
  const plumber = {
    id: "c-plumb",
    name: "Carrete Plumbing",
  }
  const framer = {
    id: "c-frame",
    name: "Mendozas Construction",
  }

  function tradeHouse(homeId: string, address: string) {
    return {
      homeId,
      addressOrLot: address,
      startDate: monday,
      tasks: [
        task({
          id: `${homeId}-plumb`,
          templateItemId: "tpl-plumb",
          nameSnapshot: "Plumbing Rough",
          contractorId: plumber.id,
          contractor: { companyName: plumber.name },
          templateItem: { optionalCategory: "MEP", isCriticalGate: true },
          isCriticalPath: true,
        }),
        task({
          id: `${homeId}-frame`,
          templateItemId: "tpl-frame",
          nameSnapshot: "Frame House",
          contractorId: framer.id,
          contractor: { companyName: framer.name },
          templateItem: { optionalCategory: "Structural", isCriticalGate: true },
          isCriticalPath: true,
        }),
      ],
    }
  }

  it("proposes dates only for the selected contractor", () => {
    const batch = buildBatchSchedulePreview({
      housesInOrder: [tradeHouse("h1", "14460 Burwood")],
      templateDeps: [],
      baseAnchorDate: monday,
      staggerWorkingDays: 0,
      mode: "all",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(batch.contractorId).toBe(plumber.id)
    expect(batch.workScopeLabel).toBe(plumber.name)
    const rows = batch.homes[0]!.preview.rows
    expect(rows.map((r) => r.taskId)).toEqual(["h1-plumb"])
    expect(proposalsToScheduledDates(batch.homes[0]!.preview).map((p) => p.taskId)).toEqual([
      "h1-plumb",
    ])
  })

  it("does not propose dates for other contractors", () => {
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: tradeHouse("h1", "A").tasks,
      templateDeps: [],
      anchorDate: monday,
      mode: "all",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(preview.rows.every((r) => r.taskId === "h1-plumb")).toBe(true)
    expect(preview.rows.some((r) => r.taskId === "h1-frame")).toBe(false)
  })

  it("critical-only works with contractor mode", () => {
    const tasks = [
      task({
        id: "crit",
        templateItemId: "tpl-c",
        nameSnapshot: "Plumbing Rough",
        contractorId: plumber.id,
        contractor: { companyName: plumber.name },
        isCriticalPath: true,
        templateItem: { optionalCategory: "MEP", isCriticalGate: true },
      }),
      task({
        id: "noncrit",
        templateItemId: "tpl-n",
        nameSnapshot: "Set Fixtures",
        contractorId: plumber.id,
        contractor: { companyName: plumber.name },
        isCriticalPath: false,
        templateItem: { optionalCategory: "MEP", isCriticalGate: false },
      }),
    ]
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks,
      templateDeps: [],
      anchorDate: monday,
      mode: "critical",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(preview.rows.map((r) => r.taskId)).toEqual(["crit"])
  })

  it("all remaining tasks works with contractor mode", () => {
    const tasks = tradeHouse("h1", "A").tasks.filter((t) => t.contractorId === plumber.id)
    tasks.push(
      task({
        id: "fixtures",
        templateItemId: "tpl-fix",
        nameSnapshot: "Set Fixtures",
        contractorId: plumber.id,
        contractor: { companyName: plumber.name },
        templateItem: { optionalCategory: "MEP", isCriticalGate: false },
      })
    )
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [...tasks, ...tradeHouse("h1", "A").tasks.filter((t) => t.contractorId === framer.id)],
      templateDeps: [],
      anchorDate: monday,
      mode: "all",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(preview.rows.map((r) => r.taskId).sort()).toEqual(["fixtures", "h1-plumb"].sort())
  })

  it("respects existing dates for contractor tasks only", () => {
    const existing = new Date("2026-08-20T12:00:00")
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [
        task({
          id: "plumb",
          templateItemId: "tpl-p",
          nameSnapshot: "Plumbing Rough",
          contractorId: plumber.id,
          contractor: { companyName: plumber.name },
          status: "Scheduled",
          scheduledDate: existing,
          templateItem: { optionalCategory: "MEP", isCriticalGate: true },
        }),
        task({
          id: "frame",
          templateItemId: "tpl-f",
          nameSnapshot: "Frame House",
          contractorId: framer.id,
          contractor: { companyName: framer.name },
          status: "Scheduled",
          scheduledDate: new Date("2026-08-12T12:00:00"),
          templateItem: { optionalCategory: "Structural", isCriticalGate: true },
        }),
      ],
      templateDeps: [],
      anchorDate: monday,
      mode: "all",
      respectExistingScheduledDates: true,
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(preview.rows[0]!.preservedExisting).toBe(true)
    expect(proposalsToScheduledDates(preview)).toHaveLength(0)
  })

  it("treats completed external predecessor as satisfied", () => {
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [
        task({
          id: "plumb",
          templateItemId: "tpl-p",
          nameSnapshot: "Plumbing Top-Out",
          contractorId: plumber.id,
          contractor: { companyName: plumber.name },
          templateItem: { optionalCategory: "MEP", isCriticalGate: true },
        }),
        task({
          id: "drywall",
          templateItemId: "tpl-d",
          nameSnapshot: "Hang Drywall",
          contractorId: framer.id,
          contractor: { companyName: framer.name },
          status: "Completed",
          completedAt: monday,
          templateItem: { optionalCategory: "Interior", isCriticalGate: true },
        }),
      ],
      templateDeps: [{ templateItemId: "tpl-p", dependsOnItemId: "tpl-d" }],
      anchorDate: monday,
      mode: "all",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(preview.blockedCount).toBe(0)
    expect(preview.proposedCount).toBe(1)
  })

  it("uses scheduled external predecessor as constraint without mutating it", () => {
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [
        task({
          id: "plumb",
          templateItemId: "tpl-p",
          nameSnapshot: "Plumbing Top-Out",
          contractorId: plumber.id,
          contractor: { companyName: plumber.name },
          templateItem: { optionalCategory: "MEP", isCriticalGate: true },
        }),
        task({
          id: "drywall",
          templateItemId: "tpl-d",
          nameSnapshot: "Hang Drywall",
          contractorId: framer.id,
          contractor: { companyName: framer.name },
          status: "Scheduled",
          scheduledDate: new Date("2026-08-14T12:00:00"),
          templateItem: { optionalCategory: "Interior", isCriticalGate: true },
        }),
      ],
      templateDeps: [{ templateItemId: "tpl-p", dependsOnItemId: "tpl-d" }],
      anchorDate: monday,
      mode: "all",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(preview.blockedCount).toBe(0)
    expect(preview.proposedCount).toBe(1)
    expect(preview.rows.every((r) => r.taskId === "plumb")).toBe(true)
  })

  it("flags unscheduled external dependency without scheduling it", () => {
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: [
        task({
          id: "plumb",
          templateItemId: "tpl-p",
          nameSnapshot: "Plumbing Top-Out",
          contractorId: plumber.id,
          contractor: { companyName: plumber.name },
          templateItem: { optionalCategory: "MEP", isCriticalGate: true },
        }),
        task({
          id: "drywall",
          templateItemId: "tpl-d",
          nameSnapshot: "Hang Drywall",
          contractorId: framer.id,
          contractor: { companyName: framer.name },
          templateItem: { optionalCategory: "Interior", isCriticalGate: true },
        }),
      ],
      templateDeps: [{ templateItemId: "tpl-p", dependsOnItemId: "tpl-d" }],
      anchorDate: monday,
      mode: "all",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(preview.blockedCount).toBe(1)
    expect(preview.rows[0]!.blockedReason).toMatch(/Hang Drywall/)
    expect(proposalsToScheduledDates(preview)).toHaveLength(0)
  })

  it("stagger ON works with contractor mode", () => {
    const batch = buildBatchSchedulePreview({
      housesInOrder: [
        tradeHouse("h1", "14460"),
        tradeHouse("h2", "14456"),
      ],
      templateDeps: [],
      baseAnchorDate: monday,
      staggerWorkingDays: 2,
      mode: "all",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(batch.homes[0]!.anchorDate.slice(0, 10)).toBe("2026-08-10")
    expect(batch.homes[1]!.anchorDate.slice(0, 10)).toBe("2026-08-12")
    expect(batch.homes.every((h) => h.preview.rows.every((r) => r.taskId.endsWith("-plumb")))).toBe(
      true
    )
  })

  it("stagger OFF keeps same anchor with contractor mode", () => {
    const batch = buildBatchSchedulePreview({
      housesInOrder: [tradeHouse("h1", "A"), tradeHouse("h2", "B")],
      templateDeps: [],
      baseAnchorDate: monday,
      staggerWorkingDays: 0,
      mode: "all",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    expect(batch.homes[0]!.anchorDate.slice(0, 10)).toBe("2026-08-10")
    expect(batch.homes[1]!.anchorDate.slice(0, 10)).toBe("2026-08-10")
  })

  it("preview proposals only include selected contractor (apply surface)", () => {
    const preview = buildSchedulePreview({
      home: { startDate: monday },
      tasks: tradeHouse("h1", "A").tasks,
      templateDeps: [],
      anchorDate: monday,
      mode: "all",
      contractorId: plumber.id,
      contractorName: plumber.name,
    })
    const apply = proposalsToScheduledDates(preview)
    expect(apply).toHaveLength(1)
    expect(apply[0]!.taskId).toBe("h1-plumb")
  })
})
