import { describe, expect, it } from "vitest"
import { isMissingHomeDisplayOrderColumn } from "./fetch-homes-list"

describe("isMissingHomeDisplayOrderColumn", () => {
  it("detects Prisma missing column errors", () => {
    const err = new Error(
      'Invalid `prisma.home.findMany()` invocation: The column `Home.displayOrder` does not exist in the current database.'
    )
    expect(isMissingHomeDisplayOrderColumn(err)).toBe(true)
  })

  it("ignores unrelated errors", () => {
    expect(isMissingHomeDisplayOrderColumn(new Error("Connection refused"))).toBe(false)
  })
})
