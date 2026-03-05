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
    expect(result.completedAt?.toISOString()).toBe("2026-03-05T00:00:00.000Z")
  })

  it("falls back to isCriticalPath when no critical gate tasks", () => {
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
  })

  it("returns nulls when there are no completed critical tasks", () => {
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
    expect(result.completedAt).toBeNull()
  })
}

