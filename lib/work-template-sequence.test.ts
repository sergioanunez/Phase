import { describe, expect, it } from "vitest"
import { shouldAppendItemPositionOnCategoryAssign } from "./work-template-sequence"

describe("shouldAppendItemPositionOnCategoryAssign", () => {
  it("does not append when saving an edit in the same category", () => {
    expect(
      shouldAppendItemPositionOnCategoryAssign({
        previousCategoryId: "cat-foundation",
        nextCategoryId: "cat-foundation",
      })
    ).toBe(false)
  })

  it("appends when moving to a different category", () => {
    expect(
      shouldAppendItemPositionOnCategoryAssign({
        previousCategoryId: "cat-foundation",
        nextCategoryId: "cat-framing",
      })
    ).toBe(true)
  })

  it("appends when assigning a category for the first time", () => {
    expect(
      shouldAppendItemPositionOnCategoryAssign({
        previousCategoryId: null,
        nextCategoryId: "cat-foundation",
      })
    ).toBe(true)
  })
})
