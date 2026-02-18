import { describe, it, expect } from "vitest"
import {
  computeCategoryCriticalPathDuration,
  type WorkTemplateForDuration,
} from "./categoryDuration"

function t(
  id: string,
  duration: number,
  depIds: string[] = []
): WorkTemplateForDuration {
  return {
    id,
    defaultDurationDays: duration,
    dependencies: depIds.map((dependsOnItemId) => ({ dependsOnItemId })),
  }
}

describe("computeCategoryCriticalPathDuration", () => {
  it("simple chain A->B->C returns correct max sum", () => {
    // A(2) -> B(3) -> C(1) => longest path = 2+3+1 = 6
    const templates = [
      t("A", 2, []),
      t("B", 3, ["A"]),
      t("C", 1, ["B"]),
    ]
    expect(computeCategoryCriticalPathDuration(templates)).toBe(6)
  })

  it("branching dependencies chooses longest branch", () => {
    // A(1) -> B(2), A(1) -> C(5). Longest path = 1+5 = 6
    const templates = [
      t("A", 1, []),
      t("B", 2, ["A"]),
      t("C", 5, ["A"]),
    ]
    expect(computeCategoryCriticalPathDuration(templates)).toBe(6)
  })

  it("cross-category dependency is ignored (dep not in set)", () => {
    // A depends on X (X not in list). Only A in category => duration = 3
    const templates = [t("A", 3, ["X"])]
    expect(computeCategoryCriticalPathDuration(templates)).toBe(3)
  })

  it("cycle returns null", () => {
    // A -> B -> C -> A
    const templates = [
      t("A", 1, ["C"]),
      t("B", 1, ["A"]),
      t("C", 1, ["B"]),
    ]
    expect(computeCategoryCriticalPathDuration(templates)).toBe(null)
  })

  it("missing duration treated as 0", () => {
    const templates = [
      { id: "A", dependencies: [] as { dependsOnItemId: string }[] },
      t("B", 4, ["A"]),
    ]
    expect(computeCategoryCriticalPathDuration(templates)).toBe(4)
  })

  it("empty category returns 0", () => {
    expect(computeCategoryCriticalPathDuration([])).toBe(0)
  })

  it("single template with no deps returns its duration", () => {
    expect(computeCategoryCriticalPathDuration([t("A", 7, [])])).toBe(7)
  })

  it("diamond picks longest path", () => {
    //   A(1)
    //  / \
    // B(2) C(2)
    //  \ /
    //   D(1)  => paths 1+2+1=4 and 1+2+1=4, max 4
    const templates = [
      t("A", 1, []),
      t("B", 2, ["A"]),
      t("C", 2, ["A"]),
      t("D", 1, ["B", "C"]),
    ]
    expect(computeCategoryCriticalPathDuration(templates)).toBe(4)
  })
})
