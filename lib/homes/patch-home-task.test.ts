import { describe, expect, it } from "vitest"
import {
  applyForecastReconcileToHome,
  mergeHomeTask,
  patchHomeTask,
} from "@/lib/homes/patch-home-task"
import {
  mutationForecastAlreadyPersisted,
  mutationNeedsGateRefresh,
} from "@/lib/homes/mutation-reconcile"

type Task = {
  id: string
  status: string
  nameSnapshot: string
  scheduledDate: string | null
  forecastEarlyStartOffsetWorkingDays?: number | null
  isCriticalPath?: boolean
  localOnly?: string
}

type Home = {
  id: string
  addressOrLot: string
  forecastCompletionDate?: string | null
  tasks: Task[]
}

describe("patchHomeTask", () => {
  const home: Home = {
    id: "h1",
    addressOrLot: "14460 Burwood",
    forecastCompletionDate: "2026-10-01",
    tasks: [
      {
        id: "a",
        status: "Confirmed",
        nameSnapshot: "Plumbing",
        scheduledDate: "2026-08-18",
        localOnly: "keep-me",
      },
      {
        id: "b",
        status: "Scheduled",
        nameSnapshot: "Electric",
        scheduledDate: "2026-08-20",
      },
    ],
  }

  it("merges only the matching task and preserves siblings + home fields", () => {
    const next = patchHomeTask(home, {
      id: "a",
      status: "Completed",
      completedAt: "2026-08-19T12:00:00.000Z",
    })
    expect(next?.forecastCompletionDate).toBe("2026-10-01")
    expect(next?.tasks).toHaveLength(2)
    expect(next?.tasks[0]?.status).toBe("Completed")
    expect(next?.tasks[0]?.localOnly).toBe("keep-me")
    expect(next?.tasks[0]?.nameSnapshot).toBe("Plumbing")
    expect(next?.tasks[1]?.status).toBe("Scheduled")
  })

  it("returns same home when task id is missing", () => {
    const next = patchHomeTask(home, { id: "missing", status: "Completed" })
    expect(next).toBe(home)
  })

  it("mergeHomeTask preserves local keys omitted from update", () => {
    const merged = mergeHomeTask(home.tasks[0]!, {
      id: "a",
      status: "InProgress",
      startedAt: "2026-08-19T10:00:00.000Z",
    })
    expect(merged.localOnly).toBe("keep-me")
    expect(merged.status).toBe("InProgress")
  })
})

describe("applyForecastReconcileToHome", () => {
  it("updates forecast fields without reverting a newer local status", () => {
    const prev: Home = {
      id: "h1",
      addressOrLot: "Lot 1",
      forecastCompletionDate: "2026-10-01",
      tasks: [
        {
          id: "a",
          status: "Completed",
          nameSnapshot: "A",
          scheduledDate: "2026-08-18",
          forecastEarlyStartOffsetWorkingDays: 1,
          isCriticalPath: false,
        },
        {
          id: "b",
          status: "InProgress",
          nameSnapshot: "B",
          scheduledDate: "2026-08-19",
          forecastEarlyStartOffsetWorkingDays: 2,
        },
      ],
    }
    // Stale forecast still shows B as Confirmed
    const remote: Home = {
      id: "h1",
      addressOrLot: "Lot 1",
      forecastCompletionDate: "2026-09-15",
      tasks: [
        {
          id: "a",
          status: "Confirmed",
          nameSnapshot: "A",
          scheduledDate: "2026-08-18",
          forecastEarlyStartOffsetWorkingDays: 5,
          isCriticalPath: true,
        },
        {
          id: "b",
          status: "Confirmed",
          nameSnapshot: "B",
          scheduledDate: "2026-08-19",
          forecastEarlyStartOffsetWorkingDays: 6,
          isCriticalPath: true,
        },
      ],
    }
    const next = applyForecastReconcileToHome(prev, remote)
    expect(next.forecastCompletionDate).toBe("2026-09-15")
    expect(next.tasks[0]?.status).toBe("Completed")
    expect(next.tasks[0]?.forecastEarlyStartOffsetWorkingDays).toBe(5)
    expect(next.tasks[0]?.isCriticalPath).toBe(true)
    expect(next.tasks[1]?.status).toBe("InProgress")
    expect(next.tasks[1]?.forecastEarlyStartOffsetWorkingDays).toBe(6)
  })
})

describe("mutation reconcile policy", () => {
  it("skips gate refresh for the five high-frequency mutations", () => {
    for (const kind of ["complete", "start", "na", "schedule", "reschedule"] as const) {
      expect(mutationNeedsGateRefresh(kind)).toBe(false)
    }
  })

  it("refreshes gates for punch updates", () => {
    expect(mutationNeedsGateRefresh("punch")).toBe(true)
  })

  it("marks N/A as forecast-already-persisted", () => {
    expect(mutationForecastAlreadyPersisted("na")).toBe(true)
    expect(mutationForecastAlreadyPersisted("complete")).toBe(false)
  })
})
