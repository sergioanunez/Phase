import { describe, it, expect } from "vitest"
import { selectLastCriticalCompletedTask, type DashboardTaskForPulse } from "./pulse"

function makeTask(overrides: Partial<DashboardTaskForPulse>): DashboardTaskForPulse {
  return {
    id: "task-1",
    status: "Unscheduled",
    scheduledDate: null,
    completedAt: null,
    updatedAt: new Date("2026-03-01T00:00:00Z"),
    isCriticalPath: false,
    durationDaysSnapshot: 5,
    templateItem: {
      name: "Task",
      isCriticalGate: false,
    },
    ...overrides,
  }
}

describe("pulse - selectLastCriticalCompletedTask", () => {
  it("returns most recent completed critical gate task", () => {
    const tasks: DashboardTaskForPulse[] = [
      makeTask({
        id: "t1",
        status: "Completed",
        completedAt: new Date("2026-03-02T00:00:00Z"),
        updatedAt: new Date("2026-03-02T00:00:00Z"),
        templateItem: { name: "Forms", isCriticalGate: true },
      }),
      makeTask({
        id: "t2",
        status: "Completed",
        completedAt: new Date("2026-03-05T00:00:00Z"),
        updatedAt: new Date("2026-03-05T00:00:00Z"),
        templateItem: { name: "Pour slab", isCriticalGate: true },
      }),
    ]

    const result = selectLastCriticalCompletedTask(tasks)
    expect(result.taskName).toBe("Pour slab")
    expect(result.taskId).toBe("t2")
    expect(result.completedAt?.toISOString()).toBe("2026-03-05T00:00:00.000Z")
  })

  it("includes isCriticalPath milestones alongside gate tasks; picks latest completed", () => {
    const tasks: DashboardTaskForPulse[] = [
      makeTask({
        id: "t1",
        status: "Completed",
        completedAt: new Date("2026-03-02T00:00:00Z"),
        updatedAt: new Date("2026-03-02T00:00:00Z"),
        isCriticalPath: true,
        templateItem: { name: "Framing", isCriticalGate: false },
      }),
      makeTask({
        id: "t2",
        status: "Completed",
        completedAt: new Date("2026-03-04T00:00:00Z"),
        updatedAt: new Date("2026-03-04T00:00:00Z"),
        isCriticalPath: true,
        templateItem: { name: "Roof dry-in", isCriticalGate: false },
      }),
    ]

    const result = selectLastCriticalCompletedTask(tasks)
    expect(result.taskName).toBe("Roof dry-in")
    expect(result.taskId).toBe("t2")
  })

  it("when gate tasks exist but none completed, still returns latest completed critical-path milestone", () => {
    const tasks: DashboardTaskForPulse[] = [
      makeTask({
        id: "gate1",
        status: "InProgress",
        templateItem: { name: "Future gate", isCriticalGate: true },
        isCriticalPath: false,
      }),
      makeTask({
        id: "cp1",
        status: "Completed",
        completedAt: new Date("2026-03-05T00:00:00Z"),
        updatedAt: new Date("2026-03-05T00:00:00Z"),
        isCriticalPath: true,
        templateItem: { name: "Slab pour", isCriticalGate: false },
      }),
    ]

    const result = selectLastCriticalCompletedTask(tasks)
    expect(result.taskName).toBe("Slab pour")
    expect(result.taskId).toBe("cp1")
  })

  it("treats 0-day duration snapshot tasks as milestones", () => {
    const tasks: DashboardTaskForPulse[] = [
      makeTask({
        id: "m1",
        status: "Completed",
        completedAt: new Date("2026-03-03T00:00:00Z"),
        updatedAt: new Date("2026-03-03T00:00:00Z"),
        durationDaysSnapshot: 0,
        isCriticalPath: false,
        templateItem: { name: "Inspection hold", isCriticalGate: false },
      }),
    ]
    const result = selectLastCriticalCompletedTask(tasks)
    expect(result.taskName).toBe("Inspection hold")
    expect(result.taskId).toBe("m1")
  })

  it("returns nulls when there are no completed milestone tasks", () => {
    const tasks: DashboardTaskForPulse[] = [
      makeTask({
        id: "t1",
        status: "InProgress",
        isCriticalPath: true,
        templateItem: { name: "Framing", isCriticalGate: false },
      }),
    ]

    const result = selectLastCriticalCompletedTask(tasks)
    expect(result.taskName).toBeNull()
    expect(result.taskId).toBeNull()
    expect(result.completedAt).toBeNull()
  })
})
