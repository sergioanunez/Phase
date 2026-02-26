import { describe, it, expect } from "vitest"
import { parseAndNormalizePhone, isValidPhone } from "./phone"

describe("parseAndNormalizePhone", () => {
  it("normalizes 10-digit US number to E.164", () => {
    expect(parseAndNormalizePhone("9155551234")).toBe("+19155551234")
    expect(parseAndNormalizePhone("(915) 555-1234")).toBe("+19155551234")
  })

  it("normalizes 11-digit with leading 1 to E.164", () => {
    expect(parseAndNormalizePhone("19155551234")).toBe("+19155551234")
  })

  it("returns null for invalid input", () => {
    expect(parseAndNormalizePhone("")).toBe(null)
    expect(parseAndNormalizePhone("123")).toBe(null)
    expect(parseAndNormalizePhone("abcdef")).toBe(null)
  })
})

describe("isValidPhone", () => {
  it("returns true for valid US number", () => {
    expect(isValidPhone("(915) 555-1234")).toBe(true)
  })
  it("returns false for too short", () => {
    expect(isValidPhone("123")).toBe(false)
  })
})
