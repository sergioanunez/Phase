import { describe, expect, it } from "vitest"
import { workingDaysBetween } from "@/lib/working-days"
import {
  buildDelaysTracker,
  computeWorkingDaysDelayed,
  delaySeverity,
  isConfirmedNotStartedDelayCandidate,
  isPastScheduledWorkingDay,
  qualifiesAsDelayedTask,
  type DelayedTaskInput,
} from "@/lib/dashboard/delays-tracker"
import {
  houseDetailsHref,
  parseInspectParam,
  serializeInspectParam,
} from "@/lib/dashboard/drilldown"

/** Local calendar dates — avoid UTC-midnight ISO strings that shift in US timezones. */
function d(y: number, m: number, day: number, h = 12): Date {
  return new Date(y, m - 1, day, h, 0, 0)
}

/** Wednesday Aug 19, 2026 */
const TODAY = d(2026, 8, 19)

function task(
  partial: Partial<DelayedTaskInput> & { id: string }
): DelayedTaskInput {
  return {
    status: "Confirmed",
    scheduledDate: d(2026, 8, 18),
    confirmedAt: d(2026, 8, 17),
    startedAt: null,
    name: "Plumbing Rough",
    contractorId: "c1",
    contractorName: "Carrete Plumbing",
    homeId: "h1",
    address: "14460 Burwood Circle",
    subdivisionName: "Verdancia Unit 1 Phase 3",
    displayOrder: 100,
    companyId: "tenant-a",
    ...partial,
  }
}

describe("Delays Tracker qualification", () => {
  it("includes confirmed + scheduled yesterday + not started", () => {
    const t = task({ id: "yesterday", scheduledDate: d(2026, 8, 18) })
    expect(qualifiesAsDelayedTask(t, TODAY)).toBe(true)
    expect(isPastScheduledWorkingDay(d(2026, 8, 18), TODAY)).toBe(true)
  })

  it("includes confirmed + scheduled several working days ago + not started", () => {
    const t = task({ id: "old", scheduledDate: d(2026, 8, 14) }) // Fri before Wed
    expect(qualifiesAsDelayedTask(t, TODAY)).toBe(true)
    expect(computeWorkingDaysDelayed(d(2026, 8, 14), TODAY)).toBeGreaterThan(1)
  })

  it("excludes confirmed + scheduled today + not started", () => {
    const t = task({ id: "today", scheduledDate: d(2026, 8, 19) })
    expect(qualifiesAsDelayedTask(t, TODAY)).toBe(false)
    expect(isPastScheduledWorkingDay(d(2026, 8, 19), TODAY)).toBe(false)
  })

  it("excludes confirmed + scheduled today + started", () => {
    const t = task({
      id: "today-started",
      scheduledDate: d(2026, 8, 19),
      status: "InProgress",
      startedAt: d(2026, 8, 19),
    })
    expect(qualifiesAsDelayedTask(t, TODAY)).toBe(false)
  })

  it("excludes confirmed + scheduled tomorrow + not started", () => {
    const t = task({ id: "tomorrow", scheduledDate: d(2026, 8, 20) })
    expect(qualifiesAsDelayedTask(t, TODAY)).toBe(false)
  })

  it("excludes scheduled yesterday but not contractor-confirmed", () => {
    for (const status of ["Scheduled", "PendingConfirm", "Unscheduled"]) {
      expect(
        qualifiesAsDelayedTask(
          task({ id: status, status, scheduledDate: d(2026, 8, 18) }),
          TODAY
        )
      ).toBe(false)
      expect(isConfirmedNotStartedDelayCandidate({ status, startedAt: null })).toBe(
        false
      )
    }
  })

  it("yesterday’s confirmed task qualifies once the next working day begins if still unstarted", () => {
    const friday = d(2026, 8, 14)
    const monday = d(2026, 8, 17)
    const t = task({ id: "fri", scheduledDate: friday })
    expect(qualifiesAsDelayedTask(t, friday)).toBe(false)
    expect(qualifiesAsDelayedTask(t, monday)).toBe(true)
  })

  it("weekend/non-working-day: Fri scheduled is not delayed on Sat/Sun", () => {
    const friday = d(2026, 8, 14)
    const saturday = d(2026, 8, 15)
    const sunday = d(2026, 8, 16)
    const monday = d(2026, 8, 17)
    const t = task({ id: "weekend", scheduledDate: friday })
    expect(workingDaysBetween(friday, saturday)).toBe(0)
    expect(workingDaysBetween(friday, sunday)).toBe(0)
    expect(workingDaysBetween(friday, monday)).toBe(1)
    expect(qualifiesAsDelayedTask(t, saturday)).toBe(false)
    expect(qualifiesAsDelayedTask(t, sunday)).toBe(false)
    expect(qualifiesAsDelayedTask(t, monday)).toBe(true)
  })

  it("excludes completed and N/A tasks", () => {
    expect(
      qualifiesAsDelayedTask(task({ id: "done", status: "Completed" }), TODAY)
    ).toBe(false)
    expect(
      qualifiesAsDelayedTask(task({ id: "na", status: "N/A" }), TODAY)
    ).toBe(false)
  })

  it("excludes started tasks", () => {
    const t = task({
      id: "started",
      status: "InProgress",
      startedAt: d(2026, 8, 18),
    })
    expect(qualifiesAsDelayedTask(t, TODAY)).toBe(false)
    expect(
      isConfirmedNotStartedDelayCandidate({
        status: "Confirmed",
        startedAt: d(2026, 8, 18),
      })
    ).toBe(false)
  })

  it("excludes Declined (unresolved reschedule / confirmation superseded)", () => {
    expect(
      qualifiesAsDelayedTask(task({ id: "declined", status: "Declined" }), TODAY)
    ).toBe(false)
  })

  it("excludes tasks without contractor (suppliers / unassigned)", () => {
    expect(
      qualifiesAsDelayedTask(
        task({ id: "none", contractorId: null, contractorName: null }),
        TODAY
      )
    ).toBe(false)
  })

  it("tenant filter is applied by caller; qualification does not mix tenants by itself", () => {
    const a = task({ id: "a", companyId: "tenant-a" })
    const b = task({ id: "b", companyId: "tenant-b", contractorId: "c2" })
    const onlyA = buildDelaysTracker(
      [a, b].filter((t) => t.companyId === "tenant-a"),
      TODAY
    )
    expect(onlyA.summary.delayedTaskCount).toBe(1)
    expect(onlyA.contractors[0]?.contractorId).toBe("c1")
  })
})

describe("Delays Tracker grouping and sorting", () => {
  it("groups multiple delayed tasks under the correct contractor", () => {
    const result = buildDelaysTracker(
      [
        task({ id: "t1", homeId: "h1", address: "A" }),
        task({
          id: "t2",
          homeId: "h2",
          address: "B",
          scheduledDate: d(2026, 8, 15), // Sat — not past working day vs Wed? Aug 15 Sat to Aug 19 Wed
        }),
        task({
          id: "t3",
          contractorId: "c2",
          contractorName: "Haskins Electric",
          homeId: "h3",
          address: "C",
          name: "Electrical Rough",
        }),
      ],
      TODAY
    )
    // Aug 15 Sat → workingDaysBetween to Wed Aug 19: Mon+Tue+Wed = 3 → delayed
    expect(result.summary.delayedTaskCount).toBe(3)
    expect(result.summary.contractorCount).toBe(2)
    expect(result.summary.homeCount).toBe(3)
    const carrete = result.contractors.find((c) => c.contractorId === "c1")
    const haskins = result.contractors.find((c) => c.contractorId === "c2")
    expect(carrete?.delayCount).toBe(2)
    expect(haskins?.delayCount).toBe(1)
  })

  it("sorts contractors by delay count, then oldest delay, then name", () => {
    const result = buildDelaysTracker(
      [
        task({
          id: "m1",
          contractorId: "c-m",
          contractorName: "Mendozas Construction",
          scheduledDate: d(2026, 8, 10),
        }),
        task({
          id: "h1",
          contractorId: "c-h",
          contractorName: "Haskins Electric",
          scheduledDate: d(2026, 8, 12),
        }),
        task({
          id: "h2",
          contractorId: "c-h",
          contractorName: "Haskins Electric",
          scheduledDate: d(2026, 8, 18),
          homeId: "h2",
        }),
        task({
          id: "c1",
          contractorId: "c-c",
          contractorName: "Carrete Plumbing",
          scheduledDate: d(2026, 8, 1),
        }),
        task({
          id: "c2",
          contractorId: "c-c",
          contractorName: "Carrete Plumbing",
          scheduledDate: d(2026, 8, 2),
          homeId: "h2",
        }),
        task({
          id: "c3",
          contractorId: "c-c",
          contractorName: "Carrete Plumbing",
          scheduledDate: d(2026, 8, 3),
          homeId: "h3",
        }),
      ],
      TODAY
    )
    expect(result.contractors.map((c) => c.contractorName)).toEqual([
      "Carrete Plumbing",
      "Haskins Electric",
      "Mendozas Construction",
    ])
    expect(result.contractors[0]?.delayCount).toBe(3)
    expect(result.contractors[1]?.delayCount).toBe(2)
    expect(result.contractors[2]?.delayCount).toBe(1)
  })

  it("sorts tasks within contractor by greatest delay first", () => {
    const result = buildDelaysTracker(
      [
        task({
          id: "newer",
          scheduledDate: d(2026, 8, 18),
          name: "Top-Out",
          address: "14512 Burwood Circle",
        }),
        task({
          id: "older",
          scheduledDate: d(2026, 8, 15),
          name: "Plumbing Rough",
          homeId: "h2",
          address: "14460 Burwood Circle",
        }),
      ],
      TODAY
    )
    const ids = result.contractors[0]?.tasks.map((t) => t.nextCriticalTaskId)
    expect(ids).toEqual(["older", "newer"])
    expect(result.contractors[0]?.tasks[0]?.daysDelayed).toBeGreaterThan(
      result.contractors[0]?.tasks[1]?.daysDelayed ?? 0
    )
  })

  it("empty state: no qualifying tasks (today / future / unconfirmed)", () => {
    const result = buildDelaysTracker(
      [
        task({ id: "today", scheduledDate: d(2026, 8, 19) }),
        task({ id: "future", scheduledDate: d(2026, 8, 22) }),
        task({ id: "unconf", status: "Scheduled", scheduledDate: d(2026, 8, 18) }),
      ],
      TODAY
    )
    expect(result.summary).toEqual({
      delayedTaskCount: 0,
      contractorCount: 0,
      homeCount: 0,
    })
    expect(result.contractors).toEqual([])
  })
})

describe("working-day delay calculation", () => {
  it("matches Phase workingDaysBetween (Fri → Mon = 1)", () => {
    const friday = d(2026, 8, 14, 0)
    const monday = d(2026, 8, 17, 0)
    expect(workingDaysBetween(friday, monday)).toBe(1)
    expect(computeWorkingDaysDelayed(friday, monday)).toBe(1)
  })

  it("same day is 0 working days delayed and does not qualify", () => {
    expect(computeWorkingDaysDelayed(TODAY, TODAY)).toBe(0)
    expect(
      qualifiesAsDelayedTask(task({ id: "same", scheduledDate: TODAY }), TODAY)
    ).toBe(false)
  })

  it("severity: 1–2 amber, 3+ red (text also conveys delay)", () => {
    expect(delaySeverity(1)).toBe("amber")
    expect(delaySeverity(2)).toBe("amber")
    expect(delaySeverity(3)).toBe("red")
    expect(delaySeverity(10)).toBe("red")
  })
})

describe("Delays Tracker drill-down / deep-link helpers", () => {
  it("serialize/parse delays inspect param for in-place drill-down", () => {
    const raw = serializeInspectParam({
      kind: "delays",
      contractorId: "c1",
      title: "Carrete Plumbing",
    })
    expect(raw).toBe("delays:c1")
    expect(parseInspectParam(raw)).toEqual({ kind: "delays", key: "c1" })
  })

  it("task deep-link opens House Details with highlight", () => {
    expect(houseDetailsHref("home-1", "task-99")).toBe(
      "/homes/home-1?task=task-99&highlight=1"
    )
  })
})
