import { describe, it, expect } from "vitest"
import { recommendPlan } from "./recommendation"

describe("recommendPlan", () => {
  it("returns starter for 0 or negative active homes", () => {
    expect(recommendPlan(0)).toBe("starter")
    expect(recommendPlan(-1)).toBe("starter")
  })

  it("returns starter when activeHomesCount <= starter limit (5)", () => {
    expect(recommendPlan(1)).toBe("starter")
    expect(recommendPlan(5)).toBe("starter")
  })

  it("returns growth when activeHomesCount <= growth limit (25) and > starter", () => {
    expect(recommendPlan(6)).toBe("growth")
    expect(recommendPlan(25)).toBe("growth")
  })

  it("returns scale when activeHomesCount > growth limit", () => {
    expect(recommendPlan(26)).toBe("scale")
    expect(recommendPlan(100)).toBe("scale")
  })

  it("returns starter for non-finite input", () => {
    expect(recommendPlan(Number.NaN)).toBe("starter")
    expect(recommendPlan(Number.POSITIVE_INFINITY)).toBe("scale")
  })
})
