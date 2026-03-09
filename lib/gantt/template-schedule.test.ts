import { describe, it, expect } from "vitest"
import { computeTemplateSchedule } from "./template-schedule"

describe("computeTemplateSchedule", () => {
  // Use local date so timezone doesn't flip the day (UTC "2026-03-09" is Mar 8 in US zones)
  const projectStart = new Date(2026, 2, 9) // Monday March 9, 2026 local

  it("schedules tasks with no dependencies from project start", () => {
    const tasks = [
      { id: "a", name: "A", category: null, durationDays: 2, dependencyIds: [] as string[], sequenceOrder: 0 },
      { id: "b", name: "B", category: null, durationDays: 1, dependencyIds: [] as string[], sequenceOrder: 1 },
    ]
    const r = computeTemplateSchedule(tasks, projectStart)
    expect(r.cycleDetected).toBe(false)
    expect(r.tasks).toHaveLength(2)
    const a = r.tasks.find((t) => t.id === "a")!
    const b = r.tasks.find((t) => t.id === "b")!
    expect(a.startDate.toDateString()).toBe(projectStart.toDateString())
    expect(a.endDate.getTime()).toBeGreaterThan(projectStart.getTime())
    expect(b.startDate.toDateString()).toBe(projectStart.toDateString())
    expect(r.links).toHaveLength(0)
  })

  it("schedules dependent task after predecessor finish", () => {
    const tasks = [
      { id: "a", name: "A", category: null, durationDays: 2, dependencyIds: [] as string[], sequenceOrder: 0 },
      { id: "b", name: "B", category: null, durationDays: 1, dependencyIds: ["a"], sequenceOrder: 1 },
    ]
    const r = computeTemplateSchedule(tasks, projectStart)
    expect(r.cycleDetected).toBe(false)
    const a = r.tasks.find((t) => t.id === "a")!
    const b = r.tasks.find((t) => t.id === "b")!
    expect(b.startDate.getTime()).toBe(a.endDate.getTime())
    expect(r.links).toEqual([{ from: "a", to: "b" }])
  })

  it("computes critical path as longest path", () => {
    const tasks = [
      { id: "a", name: "A", category: null, durationDays: 5, dependencyIds: [] as string[], sequenceOrder: 0 },
      { id: "b", name: "B", category: null, durationDays: 2, dependencyIds: [] as string[], sequenceOrder: 1 },
      { id: "c", name: "C", category: null, durationDays: 3, dependencyIds: ["a", "b"], sequenceOrder: 2 },
    ]
    const r = computeTemplateSchedule(tasks, projectStart)
    expect(r.cycleDetected).toBe(false)
    expect(r.criticalPathIds).toContain("a")
    expect(r.criticalPathIds).toContain("c")
    expect(r.criticalPathIds).not.toContain("b")
    const a = r.tasks.find((t) => t.id === "a")!
    const c = r.tasks.find((t) => t.id === "c")!
    expect(a.isCritical).toBe(true)
    expect(c.isCritical).toBe(true)
    expect(r.tasks.find((t) => t.id === "b")!.isCritical).toBe(false)
  })

  it("detects cycle and returns error", () => {
    const tasks = [
      { id: "a", name: "A", category: null, durationDays: 1, dependencyIds: ["c"], sequenceOrder: 0 },
      { id: "b", name: "B", category: null, durationDays: 1, dependencyIds: ["a"], sequenceOrder: 1 },
      { id: "c", name: "C", category: null, durationDays: 1, dependencyIds: ["b"], sequenceOrder: 2 },
    ]
    const r = computeTemplateSchedule(tasks, projectStart)
    expect(r.cycleDetected).toBe(true)
    expect(r.cycleTaskIds.length).toBeGreaterThan(0)
    expect(r.tasks).toHaveLength(0)
    expect(r.error).toMatch(/cycle/)
  })

  it("computes depth: 0 for no deps, 1 + max(dep depth) otherwise", () => {
    const tasks = [
      { id: "a", name: "A", category: null, durationDays: 1, dependencyIds: [] as string[], sequenceOrder: 0 },
      { id: "b", name: "B", category: null, durationDays: 1, dependencyIds: ["a"], sequenceOrder: 1 },
      { id: "c", name: "C", category: null, durationDays: 1, dependencyIds: ["b"], sequenceOrder: 2 },
    ]
    const r = computeTemplateSchedule(tasks, projectStart)
    expect(r.tasks.find((t) => t.id === "a")!.depth).toBe(0)
    expect(r.tasks.find((t) => t.id === "b")!.depth).toBe(1)
    expect(r.tasks.find((t) => t.id === "c")!.depth).toBe(2)
  })
})
