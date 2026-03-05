import { describe, it, expect } from "vitest"
import {
  buildTaskMap,
  isExecutionReady,
  computeFrontierTasks,
  computeBlockingFocusTask,
  pickNextExecutionTask,
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

describe("Flow selection: no downstream when dependencies incomplete", () => {
  it("frontier does not include Pour Slab when Forms is not complete", () => {
    const tasks = [
      task("forms", "Unscheduled"),
      task("slab", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    const frontier = computeFrontierTasks(tasks, map, getDeps)
    expect(frontier.some((t) => t.id === "slab")).toBe(false)
    // Frontier contains the first actionable task (Forms), not downstream Slab
    expect(frontier).toHaveLength(1)
    expect(frontier[0].id).toBe("forms")
  })

  it("blocking focus is Forms when Forms not complete (never slab)", () => {
    const tasks = [
      task("forms", "Unscheduled"),
      task("slab", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    const blocking = computeBlockingFocusTask(tasks, map, getDeps, ["forms", "slab"], {
      forms: new Date("2025-03-01"),
      slab: new Date("2025-03-05"),
    })
    expect(blocking?.id).toBe("forms")
  })

  it("frontier includes only Pour Slab when Forms is complete", () => {
    const tasks = [
      task("forms", "Completed"),
      task("slab", "Unscheduled"),
    ]
    const map = buildTaskMap(tasks)
    const getDeps = (id: string) => (id === "slab" ? ["forms"] : [])
    const frontier = computeFrontierTasks(tasks, map, getDeps)
    expect(frontier).toHaveLength(1)
    expect(frontier[0].id).toBe("slab")
  })
})
