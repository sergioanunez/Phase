import { describe, it, expect } from "vitest"
import { buildWorkTemplatePrintBlocks, buildWorkTemplatePrintDocument } from "./work-template-print"

describe("buildWorkTemplatePrintBlocks", () => {
  it("preserves category order and item order within category", () => {
    const rows = [
      { id: "cat-b", name: "Foundation", categoryPosition: 200 },
      { id: "cat-a", name: "Preliminary work", categoryPosition: 100 },
    ]
    const templates = [
      {
        id: "t2",
        name: "Dig Footings",
        defaultDurationDays: 2,
        sortOrder: 20,
        optionalCategory: "Foundation",
        workTemplateCategoryId: "cat-b",
        itemPosition: 200,
        isCriticalGate: false,
        gateName: null,
        workTemplateCategory: { id: "cat-b", name: "Foundation", categoryPosition: 200 },
      },
      {
        id: "t1",
        name: "Plans Received",
        defaultDurationDays: 1,
        sortOrder: 10,
        optionalCategory: "Preliminary work",
        workTemplateCategoryId: "cat-a",
        itemPosition: 100,
        isCriticalGate: true,
        gateName: null,
        workTemplateCategory: { id: "cat-a", name: "Preliminary work", categoryPosition: 100 },
      },
    ]

    const result = buildWorkTemplatePrintBlocks(rows, templates)
    expect(result.blocks.map((b) => b.categoryName)).toEqual(["Preliminary work", "Foundation"])
    expect(result.blocks[0]?.items.map((i) => i.name)).toEqual(["Plans Received"])
    expect(result.blocks[1]?.items.map((i) => i.name)).toEqual(["Dig Footings"])
    expect(result.totalWorkItems).toBe(2)
  })

  it("groups uncategorized items", () => {
    const result = buildWorkTemplatePrintBlocks([], [
      {
        id: "t1",
        name: "Loose Item",
        defaultDurationDays: 1,
        sortOrder: 1,
        optionalCategory: null,
        workTemplateCategoryId: null,
        isCriticalGate: false,
        gateName: null,
      },
    ])
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]?.categoryName).toBe("Uncategorized")
  })
})

describe("buildWorkTemplatePrintDocument", () => {
  it("includes company title and empty state", () => {
    const html = buildWorkTemplatePrintDocument({
      companyName: "Cullers Homes",
      generatedAt: "Jun 18, 2026",
      mode: "compact",
      totalCategories: 0,
      totalWorkItems: 0,
      totalWorkingDays: 0,
      blocks: [],
      criticalTemplateIds: [],
    })
    expect(html).toContain("Cullers Homes")
    expect(html).toContain("No work items in this template yet.")
  })
})
