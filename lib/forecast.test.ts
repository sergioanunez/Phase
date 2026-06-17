import { describe, it, expect } from "vitest"
import {
  addWorkingDays,
  workingDaysBetween,
  topologicalSort,
  computeHomeForecast,
  applyForecastSanityFloor,
  type TaskNode,
} from "./forecast"

function task(
  id: string,
  opts: Partial<TaskNode> & { durationDays: number; dependencyIds: string[] }
): TaskNode {
  const { durationDays, dependencyIds, ...rest } = opts
  return {
    id,
    name: id,
    durationDays,
    dependencyIds,
    status: "NOT_STARTED",
    ...rest,
  }
}

/** Monday March 3, 2025 (local) */
function monday() {
  const d = new Date(2025, 2, 3)
  d.setHours(0, 0, 0, 0)
  return d
}

describe("addWorkingDays / workingDaysBetween", () => {
  it("weekend skipping: from Friday, +1 working day is Monday", () => {
    const friday = new Date(2025, 2, 7)
    friday.setHours(0, 0, 0, 0)
    expect(friday.getDay()).toBe(5)
    const next = addWorkingDays(friday, 1)
    expect(next.getDay()).toBe(1)
  })

  it("workingDaysBetween counts only Mon–Fri", () => {
    const mon = new Date("2025-03-03T00:00:00Z")
    mon.setHours(0, 0, 0, 0)
    const fri = new Date("2025-03-07T00:00:00Z")
    fri.setHours(0, 0, 0, 0)
    expect(workingDaysBetween(mon, fri)).toBe(4)
  })
})

describe("applyForecastSanityFloor", () => {
  it("raises finish when CPM undercounts many parallel roots (sparse deps)", () => {
    const homeStart = monday()
    const tasks: TaskNode[] = [
      task("a", { durationDays: 10, dependencyIds: [], status: "NOT_STARTED" }),
      task("b", { durationDays: 10, dependencyIds: [], status: "NOT_STARTED" }),
      task("c", { durationDays: 10, dependencyIds: [], status: "NOT_STARTED" }),
    ]
    const cpm = computeHomeForecast(tasks, homeStart)
    expect(workingDaysBetween(homeStart, cpm.forecastDate)).toBe(9)

    const merged = applyForecastSanityFloor(cpm, {
      homeStart,
      taskNodes: tasks,
      remainingWorkingDays: 85,
    })
    expect(workingDaysBetween(homeStart, merged.forecastDate)).toBeGreaterThanOrEqual(85)
    expect(merged.warnings.some((w) => w.includes("raised to phase-based"))).toBe(true)
  })

  it("does not lower an already-long CPM finish", () => {
    const homeStart = monday()
    const tasks: TaskNode[] = [
      task("a", { durationDays: 40, dependencyIds: [], status: "NOT_STARTED" }),
      task("b", { durationDays: 50, dependencyIds: ["a"], status: "NOT_STARTED" }),
    ]
    const cpm = computeHomeForecast(tasks, homeStart)
    const merged = applyForecastSanityFloor(cpm, {
      homeStart,
      taskNodes: tasks,
      remainingWorkingDays: 85,
    })
    expect(merged.forecastDate.getTime()).toBe(cpm.forecastDate.getTime())
  })
})

describe("topologicalSort", () => {
  it("returns order for DAG", () => {
    const tasks = [
      task("a", { durationDays: 1, dependencyIds: [] }),
      task("b", { durationDays: 1, dependencyIds: ["a"] }),
    ]
    const { order, cycleTaskIds, warnings } = topologicalSort(tasks)
    expect(order.map((t) => t.id)).toEqual(["a", "b"])
    expect(cycleTaskIds).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it("cycle detection returns warning and identifies cycle tasks", () => {
    const tasks = [
      task("a", { durationDays: 1, dependencyIds: ["c"] }),
      task("b", { durationDays: 1, dependencyIds: ["a"] }),
      task("c", { durationDays: 1, dependencyIds: ["b"] }),
    ]
    const { order, cycleTaskIds, warnings } = topologicalSort(tasks)
    expect(order).toHaveLength(0)
    expect(cycleTaskIds.length).toBeGreaterThanOrEqual(2)
    expect(warnings.some((w) => w.includes("cycle"))).toBe(true)
  })
})

describe("computeHomeForecast", () => {
  it("completing a critical dependency late pushes forecast later", () => {
    const homeStart = monday()
    const tasksLate: TaskNode[] = [
      task("forms", {
        durationDays: 2,
        dependencyIds: [],
        status: "COMPLETE",
        completedAt: new Date("2025-03-06T12:00:00Z"),
      }),
      task("slab", {
        durationDays: 3,
        dependencyIds: ["forms"],
        status: "NOT_STARTED",
      }),
    ]
    const resultLate = computeHomeForecast(tasksLate, homeStart)
    const lateDate = resultLate.forecastDate.getTime()

    const tasksOnTime: TaskNode[] = [
      task("forms", {
        durationDays: 2,
        dependencyIds: [],
        status: "COMPLETE",
        completedAt: new Date("2025-03-04T12:00:00Z"),
      }),
      task("slab", {
        durationDays: 3,
        dependencyIds: ["forms"],
        status: "NOT_STARTED",
      }),
    ]
    const resultOnTime = computeHomeForecast(tasksOnTime, homeStart)
    const onTimeDate = resultOnTime.forecastDate.getTime()

    expect(lateDate).toBeGreaterThan(onTimeDate)
  })

  it("completing early pulls forecast earlier", () => {
    const homeStart = monday()
    const tasksAllNotStarted: TaskNode[] = [
      task("forms", { durationDays: 5, dependencyIds: [] }),
      task("slab", { durationDays: 3, dependencyIds: ["forms"] }),
    ]
    const resultNotStarted = computeHomeForecast(tasksAllNotStarted, homeStart)
    const forecastNotStarted = resultNotStarted.forecastDate.getTime()

    const tasksFormsCompleteEarly: TaskNode[] = [
      task("forms", {
        durationDays: 5,
        dependencyIds: [],
        status: "COMPLETE",
        completedAt: new Date("2025-03-04T12:00:00Z"),
      }),
      task("slab", { durationDays: 3, dependencyIds: ["forms"] }),
    ]
    const resultEarly = computeHomeForecast(tasksFormsCompleteEarly, homeStart)
    const forecastEarly = resultEarly.forecastDate.getTime()

    expect(forecastEarly).toBeLessThan(forecastNotStarted)
  })

  it("two homes with different completedAt yield different forecast", () => {
    const homeStart = monday()
    const tasksA: TaskNode[] = [
      task("forms", {
        durationDays: 2,
        dependencyIds: [],
        status: "COMPLETE",
        completedAt: new Date("2025-03-05T00:00:00Z"),
      }),
      task("slab", { durationDays: 2, dependencyIds: ["forms"] }),
    ]
    const tasksB: TaskNode[] = [
      task("forms", {
        durationDays: 2,
        dependencyIds: [],
        status: "COMPLETE",
        completedAt: new Date("2025-03-10T00:00:00Z"),
      }),
      task("slab", { durationDays: 2, dependencyIds: ["forms"] }),
    ]
    const resultA = computeHomeForecast(tasksA, homeStart)
    const resultB = computeHomeForecast(tasksB, homeStart)
    expect(resultA.forecastDate.getTime()).not.toBe(resultB.forecastDate.getTime())
  })

  it("move scheduledStartDate later without completing pushes forecast out", () => {
    const homeStart = monday()
    const tasksNoSchedule: TaskNode[] = [
      task("a", { durationDays: 2, dependencyIds: [] }),
    ]
    const resultNo = computeHomeForecast(tasksNoSchedule, homeStart)

    const tasksLaterSchedule: TaskNode[] = [
      task("a", {
        durationDays: 2,
        dependencyIds: [],
        scheduledStartDate: new Date("2025-03-10T00:00:00Z"),
      }),
    ]
    const resultLater = computeHomeForecast(tasksLaterSchedule, homeStart)
    expect(resultLater.forecastDate.getTime()).toBeGreaterThanOrEqual(
      resultNo.forecastDate.getTime()
    )
  })

  it("critical path is returned", () => {
    const homeStart = monday()
    const tasks: TaskNode[] = [
      task("a", { durationDays: 1, dependencyIds: [] }),
      task("b", { durationDays: 5, dependencyIds: ["a"] }),
      task("c", { durationDays: 1, dependencyIds: ["a"] }),
    ]
    const result = computeHomeForecast(tasks, homeStart)
    expect(result.criticalPathTaskIds).toContain("a")
    expect(result.criticalPathTaskIds).toContain("b")
    expect(result.criticalPathTaskIds).not.toContain("c")
  })

  it("duration 1 gives finish = start (same day)", () => {
    const homeStart = monday()
    const tasks: TaskNode[] = [
      task("a", { durationDays: 1, dependencyIds: [] }),
    ]
    const result = computeHomeForecast(tasks, homeStart)
    const startDay = startOfDay(result.taskEarlyStart!["a"] ?? homeStart).getTime()
    const finishDay = startOfDay(result.taskEarlyFinish!["a"] ?? homeStart).getTime()
    expect(finishDay).toBe(startDay)
  })

  it("duration 0 gives finish = start (same day)", () => {
    const homeStart = monday()
    const tasks: TaskNode[] = [
      task("a", { durationDays: 0, dependencyIds: [] }),
    ]
    const result = computeHomeForecast(tasks, homeStart)
    const startDay = startOfDay(result.taskEarlyStart!["a"] ?? homeStart).getTime()
    const finishDay = startOfDay(result.forecastDate).getTime()
    expect(finishDay).toBe(startDay)
  })
})

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}
