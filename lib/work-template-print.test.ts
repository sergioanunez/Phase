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

  it("renders working print table with blank date columns and critical marker", () => {
    const html = buildWorkTemplatePrintDocument({
      companyName: "Cullers Homes",
      companyLogoUrl: "https://example.com/logo.png",
      generatedAt: "Jun 18, 2026",
      mode: "working",
      totalCategories: 1,
      totalWorkItems: 2,
      totalWorkingDays: 3,
      criticalTemplateIds: ["t2"],
      blocks: [
        {
          id: "cat-a",
          categoryName: "Preliminary Work",
          categoryIndex: 1,
          itemCount: 2,
          workingDays: 3,
          items: [
            {
              id: "t1",
              name: "Plans Received",
              defaultDurationDays: 1,
              sortOrder: 10,
              optionalCategory: "Preliminary Work",
              workTemplateCategoryId: "cat-a",
              itemPosition: 100,
              isCriticalGate: false,
              gateName: null,
            },
            {
              id: "t2",
              name: "Plumbing Inspection",
              defaultDurationDays: 2,
              sortOrder: 20,
              optionalCategory: "Preliminary Work",
              workTemplateCategoryId: "cat-a",
              itemPosition: 200,
              isCriticalGate: false,
              gateName: null,
            },
          ],
        },
      ],
    })

    expect(html).toContain("Work Items Working Schedule")
    expect(html).toContain('src="https://example.com/logo.png"')
    expect(html).toContain("Preliminary Work")
    expect(html).toContain(">Called</th>")
    expect(html).toContain(">Scheduled</th>")
    expect(html).toContain(">Started</th>")
    expect(html).toContain(">Finished</th>")
    expect(html).toContain("Plans Received")
    expect(html).toContain("* Plumbing Inspection")
    expect(html).toContain('class="col-blank"')
    expect(html).toContain("Address:")
    expect(html).toContain("Start Date:")
    expect(html).toContain("Total working days: 3 working days")
    expect(html).toContain('class="category-row"')
  })

  it("shows company name when no logo in working print", () => {
    const html = buildWorkTemplatePrintDocument({
      companyName: "Cullers Homes",
      generatedAt: "Jun 18, 2026",
      mode: "working",
      totalCategories: 0,
      totalWorkItems: 0,
      totalWorkingDays: 0,
      blocks: [],
      criticalTemplateIds: [],
    })
    expect(html).toContain('class="company-name"')
    expect(html).toContain("Cullers Homes")
  })
})
