import { describe, it, expect } from "vitest"
import {
  computeCurrentPhaseForHome,
  deriveOrderedCategories,
  NOT_STARTED_PHASE_KEY,
  COMPLETE_PHASE_KEY,
  type DashboardHomeForPhase,
} from "./phaseDistribution"

function makeHome(overrides: Partial<DashboardHomeForPhase>): DashboardHomeForPhase {
  return {
    id: "home-1",
    addressOrLot: "123 Main",
    startDate: null,
    createdAt: new Date("2026-03-01"),
    isComplete: false,
    tasks: [],
    ...overrides,
  }
}

describe("phaseDistribution - computeCurrentPhaseForHome", () => {
  it("returns Not started when no tasks and no start date", () => {
    const home = makeHome({})
    const categories = deriveOrderedCategories([home])
    const phase = computeCurrentPhaseForHome(home, categories)
    expect(phase.key).toBe(NOT_STARTED_PHASE_KEY)
    expect(phase.name).toBe("Not started")
  })

  it("returns first category with incomplete tasks as current phase", () => {
    const home = makeHome({
      startDate: new Date("2026-03-01"),
      tasks: [
        {
          id: "t1",
          status: "Completed",
          scheduledDate: new Date("2026-03-02"),
          templateItem: { name: "Footings", optionalCategory: "Foundation", sortOrder: 1 },
        },
        {
          id: "t2",
          status: "InProgress",
          scheduledDate: new Date("2026-03-05"),
          templateItem: { name: "Framing", optionalCategory: "Framing", sortOrder: 2 },
        },
        {
          id: "t3",
          status: "Unscheduled",
          scheduledDate: null,
          templateItem: { name: "Trim", optionalCategory: "Trim", sortOrder: 3 },
        },
      ],
    })

    const categories = deriveOrderedCategories([home])
    const phase = computeCurrentPhaseForHome(home, categories)
    expect(phase.key).not.toBe(NOT_STARTED_PHASE_KEY)
    expect(phase.key).not.toBe(COMPLETE_PHASE_KEY)
    expect(phase.name).toBe("Framing")
  })

  it("returns Complete when all tasks are Completed", () => {
    const home = makeHome({
      startDate: new Date("2026-03-01"),
      tasks: [
        {
          id: "t1",
          status: "Completed",
          scheduledDate: new Date("2026-03-02"),
          templateItem: { name: "Footings", optionalCategory: "Foundation", sortOrder: 1 },
        },
        {
          id: "t2",
          status: "Completed",
          scheduledDate: new Date("2026-03-05"),
          templateItem: { name: "Framing", optionalCategory: "Framing", sortOrder: 2 },
        },
      ],
    })

    const categories = deriveOrderedCategories([home])
    const phase = computeCurrentPhaseForHome(home, categories)
    expect(phase.key).toBe(COMPLETE_PHASE_KEY)
    expect(phase.name).toBe("Complete")
  })
}

