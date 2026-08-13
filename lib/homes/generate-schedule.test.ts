import { describe, expect, it } from "vitest"
import {
  buildSchedulePreview,
  computeDefaultAnchorDate,
  isScheduleTaskCompleted,
} from "./generate-schedule"

const baseTask = {
  templateItemId: "tpl-1",
  nameSnapshot: "Task A",
  durationDaysSnapshot: 5,
  scheduledDate: null,
  completedAt: null,
  isCriticalPath: false,
  templateItem: { optionalCategory: "Foundation", isCriticalGate: false },
  contractorId: null,
  contractor: null,
}

describe("computeDefaultAnchorDate", () => {
  it("uses house start when no completed tasks", () => {
    const anchor = computeDefaultAnchorDate(
      { startDate: new Date("2026-06-01T12:00:00Z") },
      [{ ...baseTask, id: "1", status: "Unscheduled" }]
    )
    expect(anchor.toISOString().slice(0, 10)).toBe("2026-06-01")
  })
})

describe("buildSchedulePreview", () => {
  it("skips completed tasks", () => {
    const preview = buildSchedulePreview({
      home: { startDate: new Date("2026-06-02") },
      tasks: [
        {
          ...baseTask,
          id: "done",
          status: "Completed",
          completedAt: new Date("2026-06-02"),
        },
        { ...baseTask, id: "t2", status: "Unscheduled", durationDaysSnapshot: 3 },
      ],
      templateDeps: [],
      anchorDate: new Date("2026-06-03"),
      mode: "all",
    })
    expect(preview.completedSkipped).toBe(1)
    expect(preview.proposedCount).toBe(1)
    expect(preview.rows[0]!.taskId).toBe("t2")
  })

  it("preserves existing scheduled dates when respect mode is on", () => {
    const preview = buildSchedulePreview({
      home: { startDate: new Date("2026-06-02") },
      tasks: [
        {
          ...baseTask,
          id: "scheduled",
          status: "Scheduled",
          scheduledDate: new Date("2026-07-10T12:00:00"),
        },
        { ...baseTask, id: "open", status: "Unscheduled", durationDaysSnapshot: 3 },
      ],
      templateDeps: [],
      anchorDate: new Date("2026-06-03"),
      mode: "all",
      respectExistingScheduledDates: true,
    })
    const scheduledRow = preview.rows.find((r) => r.taskId === "scheduled")
    expect(scheduledRow?.proposedStart.slice(0, 10)).toBe("2026-07-10")
    expect(scheduledRow?.currentScheduledDate?.slice(0, 10)).toBe("2026-07-10")
  })

  it("returns error when no remaining tasks", () => {
    const preview = buildSchedulePreview({
      home: { startDate: null },
      tasks: [{ ...baseTask, id: "1", status: "Completed", completedAt: new Date() }],
      templateDeps: [],
      anchorDate: new Date(),
      mode: "all",
    })
    expect(preview.error).toMatch(/No remaining tasks/)
  })
})

describe("isScheduleTaskCompleted", () => {
  it("identifies completed status", () => {
    expect(isScheduleTaskCompleted({ status: "Completed" })).toBe(true)
    expect(isScheduleTaskCompleted({ status: "Scheduled" })).toBe(false)
  })
})
