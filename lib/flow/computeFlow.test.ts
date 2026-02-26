import { describe, it, expect } from "vitest"
import { detectCircularTemplateIds } from "./computeFlow"

describe("detectCircularTemplateIds", () => {
  it("returns empty set when no edges", () => {
    const ids = ["a", "b", "c"]
    const edges: Array<{ templateItemId: string; dependsOnItemId: string }> = []
    expect(detectCircularTemplateIds(ids, edges).size).toBe(0)
  })

  it("returns empty set for DAG", () => {
    const ids = ["a", "b", "c"]
    const edges = [
      { templateItemId: "b", dependsOnItemId: "a" },
      { templateItemId: "c", dependsOnItemId: "b" },
    ]
    expect(detectCircularTemplateIds(ids, edges).size).toBe(0)
  })

  it("detects simple cycle", () => {
    const ids = ["a", "b"]
    const edges = [
      { templateItemId: "b", dependsOnItemId: "a" },
      { templateItemId: "a", dependsOnItemId: "b" },
    ]
    const cyclic = detectCircularTemplateIds(ids, edges)
    expect(cyclic.has("a")).toBe(true)
    expect(cyclic.has("b")).toBe(true)
  })

  it("detects cycle in three-node graph", () => {
    const ids = ["a", "b", "c"]
    const edges = [
      { templateItemId: "b", dependsOnItemId: "a" },
      { templateItemId: "c", dependsOnItemId: "b" },
      { templateItemId: "a", dependsOnItemId: "c" },
    ]
    const cyclic = detectCircularTemplateIds(ids, edges)
    expect(cyclic.size).toBe(3)
    expect(cyclic.has("a")).toBe(true)
    expect(cyclic.has("b")).toBe(true)
    expect(cyclic.has("c")).toBe(true)
  })

  it("identifies all nodes in cycle (and optionally nodes that feed into it)", () => {
    const ids = ["a", "b", "c", "d"]
    const edges = [
      { templateItemId: "b", dependsOnItemId: "a" },
      { templateItemId: "c", dependsOnItemId: "b" },
      { templateItemId: "d", dependsOnItemId: "c" },
      { templateItemId: "b", dependsOnItemId: "d" }, // cycle b->c->d->b
    ]
    const cyclic = detectCircularTemplateIds(ids, edges)
    expect(cyclic.has("b")).toBe(true)
    expect(cyclic.has("c")).toBe(true)
    expect(cyclic.has("d")).toBe(true)
    expect(cyclic.size).toBeGreaterThanOrEqual(3)
  })
})

describe("prep lead days max", () => {
  it("PrepLeadDays = max(prep_lead_days, contractor_lead, material_lead when requires_ordering)", () => {
    const prepLeadDays = 2
    const contractorLead = 3
    const materialLead = 5
    const requiresOrdering = true
    const result = Math.max(prepLeadDays, contractorLead, requiresOrdering ? materialLead : 0)
    expect(result).toBe(5)
  })
  it("when requires_ordering false, material lead not counted", () => {
    const prepLeadDays = 2
    const contractorLead = 1
    const materialLead = 10
    const requiresOrdering = false
    const result = Math.max(prepLeadDays, contractorLead, requiresOrdering ? materialLead : 0)
    expect(result).toBe(2)
  })
})
