import { describe, it, expect } from "vitest"
import {
  buildTaskMap,
  isExecutionReady,
  computeFrontierTasks,
  computeBlockingFocusTask,
  pickNextExecutionTask,
  pickNextCriticalUnscheduledTask,
  computeFlowUrgency,
  compareFlowUrgency,
  type FlowTaskForSelection,
} from "./selection"

function task(
  id: string,
  status: string,
  opts: { scheduledDate?: Date; forecastStart?: Date; sortOrder?: number } = {}
): FlowTaskForSelection {
  return {
    id,
    status,
    scheduledDate: opts.scheduledDate,
    forecastStart: opts.forecastStart,
    sortOrderSnapshot: opts.sortOrder ?? 0,
  }
}

describe("buildTaskMap", () => {
  it("builds id -> task map", () => {
    const tasks = [task("a", "Unscheduled"), task("b", "Completed")]
    const map = buildTaskMap(tasks)
    expect(map.get("a")?.status).toBe("Unscheduled")
    expect(map.get("b")?.status).toBe("Completed")
    expect(map.size).toBe(2)
  })
})

describe("isExecutionReady", () => {
  it("returns true when task has no dependencies", () => {
    const tasks = [task("a", "Unscheduled")]
    const map = buildTaskMap(tasks)
    expect(isExecutionReady("a", map, () => [])).toBe(true)
  })

  it("returns true when all dependencies are Complete", () => {
    const tasks = [
      task("forms", "Completed"),
      task("slab", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    expect(isExecutionReady("slab", map, (id) => (id === "slab" ? ["forms"] : []))).toBe(true)
  })

  it("returns false when any dependency is not Complete", () => {
    const tasks = [
      task("forms", "InProgress"),
      task("slab", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    expect(isExecutionReady("slab", map, (id) => (id === "slab" ? ["forms"] : []))).toBe(false)
  })
})

describe("computeFrontierTasks", () => {
  it("returns only non-Complete, execution-ready tasks", () => {
    const tasks = [
      task("forms", "Completed"),
      task("slab", "Unscheduled"),
      task("frame", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : id === "frame" ? ["slab"] : [])
    const frontier = computeFrontierTasks(tasks, map, getDeps)
    expect(frontier).toHaveLength(1)
    expect(frontier[0].id).toBe("slab")
  })

  it("when home not started, frontier contains first root task (Forms) not empty", () => {
    const tasks = [
      task("forms", "Unscheduled"),
      task("slab", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    const frontier = computeFrontierTasks(tasks, map, getDeps)
    // Forms has no deps so it is execution-ready; Slab depends on Forms so not ready
    expect(frontier).toHaveLength(1)
    expect(frontier[0].id).toBe("forms")
  })

  it("excludes Completed tasks from frontier", () => {
    const tasks = [
      task("forms", "Completed"),
      task("slab", "Completed"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    const frontier = computeFrontierTasks(tasks, map, getDeps)
    expect(frontier).toHaveLength(0)
  })
})

describe("computeBlockingFocusTask", () => {
  const topoOrder = ["forms", "slab", "frame"]
  const forecastStart: Record<string, Date> = {
    forms: new Date("2025-03-01"),
    slab: new Date("2025-03-05"),
    frame: new Date("2025-03-10"),
  }

  it("returns IN_PROGRESS task first when present", () => {
    const tasks = [
      task("forms", "InProgress"),
      task("slab", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    const blocking = computeBlockingFocusTask(tasks, map, getDeps, topoOrder, forecastStart)
    expect(blocking?.id).toBe("forms")
    expect(blocking?.status).toBe("InProgress")
  })

  it("returns earliest blocking prerequisite by topo order when none in progress", () => {
    const tasks = [
      task("forms", "Unscheduled"),
      task("slab", "Unscheduled"),
      task("frame", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) =>
      id === "slab" ? ["forms"] : id === "frame" ? ["slab"] : []
    const blocking = computeBlockingFocusTask(tasks, map, getDeps, topoOrder, forecastStart)
    expect(blocking?.id).toBe("forms")
  })

  it("home not started: expects first root task selected as blocking", () => {
    const tasks = [
      task("forms", "Unscheduled", { sortOrder: 0 }),
      task("slab", "Unscheduled", { sortOrder: 1 }),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    const blocking = computeBlockingFocusTask(tasks, map, getDeps, ["forms", "slab"], forecastStart)
    expect(blocking?.id).toBe("forms")
  })
})

describe("pickNextExecutionTask", () => {
  it("returns earliest by forecastStart when frontier has multiple", () => {
    const earlier = new Date("2025-03-05")
    const later = new Date("2025-03-10")
    const tasks = [
      task("b", "Unscheduled", { forecastStart: later }),
      task("a", "Unscheduled", { forecastStart: earlier }),
    ]
    const forecastStart: Record<string, Date> = { a: earlier, b: later }
    const next = pickNextExecutionTask(tasks, forecastStart)
    expect(next?.id).toBe("a")
  })

  it("returns earliest by scheduledDate when set", () => {
    const tasks = [
      task("a", "Unscheduled", { scheduledDate: new Date("2025-03-10") }),
      task("b", "Unscheduled", { scheduledDate: new Date("2025-03-05") }),
    ]
    const next = pickNextExecutionTask(tasks, {})
    expect(next?.id).toBe("b")
  })
})

describe("pickNextCriticalUnscheduledTask", () => {
  const topo = ["forms", "slab", "frame", "paint"]
  const forecast: Record<string, Date> = {
    forms: new Date("2025-03-01"),
    slab: new Date("2025-03-05"),
    frame: new Date("2025-03-10"),
    paint: new Date("2025-03-20"),
  }

  function criticalTask(
    id: string,
    status: string,
    opts: {
      scheduledDate?: Date | null
      forecastStart?: Date
      sortOrder?: number
      isCritical?: boolean
    } = {}
  ): FlowTaskForSelection {
    return {
      id,
      status,
      scheduledDate: opts.scheduledDate === undefined ? null : opts.scheduledDate,
      forecastStart: opts.forecastStart,
      sortOrderSnapshot: opts.sortOrder ?? 0,
      isCritical: opts.isCritical ?? true,
    }
  }

  it("picks first critical unscheduled with deps complete", () => {
    const tasks = [
      criticalTask("forms", "Completed", { scheduledDate: new Date("2025-03-01") }),
      criticalTask("slab", "Unscheduled"),
      criticalTask("frame", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) =>
      id === "slab" ? ["forms"] : id === "frame" ? ["slab"] : []
    const next = pickNextCriticalUnscheduledTask(tasks, topo, map, getDeps, forecast)
    expect(next?.id).toBe("slab")
  })

  it("skips non-critical tasks even when they are earlier in sequence", () => {
    const tasks = [
      criticalTask("forms", "Completed", { scheduledDate: new Date("2025-03-01") }),
      criticalTask("slab", "Unscheduled", { isCritical: false }),
      criticalTask("paint", "Unscheduled", { isCritical: true }),
    ]
    const map = buildTaskMap(tasks)
    // paint only depends on forms (critical path shortcut for test)
    const getDeps = (id: string) => (id === "paint" || id === "slab" ? ["forms"] : [])
    const next = pickNextCriticalUnscheduledTask(tasks, topo, map, getDeps, forecast)
    expect(next?.id).toBe("paint")
  })

  it("skips scheduled critical tasks when next critical deps are complete", () => {
    const tasks = [
      criticalTask("forms", "Completed", { scheduledDate: new Date("2025-03-01") }),
      criticalTask("slab", "Completed", { scheduledDate: new Date("2025-03-05") }),
      criticalTask("frame", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) =>
      id === "slab" ? ["forms"] : id === "frame" ? ["slab"] : []
    const next = pickNextCriticalUnscheduledTask(tasks, topo, map, getDeps, forecast)
    expect(next?.id).toBe("frame")
  })

  it("requires predecessor completion before surfacing", () => {
    const tasks = [
      criticalTask("forms", "InProgress", { scheduledDate: new Date("2025-03-01") }),
      criticalTask("slab", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    expect(pickNextCriticalUnscheduledTask(tasks, topo, map, getDeps, forecast)).toBeNull()
  })

  it("ignores N/A and completed", () => {
    const tasks = [
      criticalTask("forms", "NotApplicable"),
      criticalTask("slab", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    // forms N/A counts as resolved for deps
    const next = pickNextCriticalUnscheduledTask(tasks, topo, map, getDeps, forecast)
    expect(next?.id).toBe("slab")
  })

  it("returns null when no critical unscheduled tasks", () => {
    const tasks = [
      criticalTask("forms", "Completed", { scheduledDate: new Date("2025-03-01") }),
      criticalTask("slab", "Scheduled", { scheduledDate: new Date("2025-03-05") }),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    expect(pickNextCriticalUnscheduledTask(tasks, topo, map, getDeps, forecast)).toBeNull()
  })
})

describe("computeFlowUrgency", () => {
  const today = new Date("2025-03-10T12:00:00")

  it("marks past forecast start as OVERDUE", () => {
    expect(
      computeFlowUrgency({ forecastStart: new Date("2025-03-08T12:00:00"), today })
    ).toBe("OVERDUE")
  })

  it("marks today as AT_RISK", () => {
    expect(
      computeFlowUrgency({ forecastStart: new Date("2025-03-10T12:00:00"), today })
    ).toBe("AT_RISK")
  })

  it("marks within 7 days as READY", () => {
    expect(
      computeFlowUrgency({ forecastStart: new Date("2025-03-15T12:00:00"), today })
    ).toBe("READY")
  })

  it("marks beyond 7 days as FUTURE", () => {
    expect(
      computeFlowUrgency({ forecastStart: new Date("2025-03-25T12:00:00"), today })
    ).toBe("FUTURE")
  })

  it("marks negative slack as AT_RISK when not overdue", () => {
    expect(
      computeFlowUrgency({
        forecastStart: new Date("2025-03-15T12:00:00"),
        today,
        slackWorkingDays: -2,
      })
    ).toBe("AT_RISK")
  })
})

describe("compareFlowUrgency", () => {
  it("sorts Overdue before At Risk before Ready before Future", () => {
    const items = [
      { urgency: "FUTURE" as const, actionDate: "2025-04-01" },
      { urgency: "READY" as const, actionDate: "2025-03-12" },
      { urgency: "OVERDUE" as const, actionDate: "2025-03-01" },
      { urgency: "AT_RISK" as const, actionDate: "2025-03-10" },
    ]
    items.sort(compareFlowUrgency)
    expect(items.map((i) => i.urgency)).toEqual(["OVERDUE", "AT_RISK", "READY", "FUTURE"])
  })
})
