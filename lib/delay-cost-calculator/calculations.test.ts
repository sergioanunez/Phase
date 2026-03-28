import { describe, expect, it } from "vitest"
import { calculateDelayMetrics, getDefaultDelayCalculatorInputs } from "./calculations"

describe("calculateDelayMetrics", () => {
  it("matches documented formulas for defaults", () => {
    const inputs = getDefaultDelayCalculatorInputs()
    const m = calculateDelayMetrics(inputs)
    const dailyInterest = (300_000 * 0.09) / 365
    const dailyOverhead = 1200 / 30
    const dailyHolding = 350 / 30
    expect(m.dailyInterest).toBeCloseTo(dailyInterest, 8)
    expect(m.dailyOverhead).toBeCloseTo(dailyOverhead, 8)
    expect(m.dailyHolding).toBeCloseTo(dailyHolding, 8)
    expect(m.dailyDelayCost).toBeCloseTo(dailyInterest + dailyOverhead + dailyHolding, 8)
    expect(m.totalDelayCost).toBeCloseTo(m.dailyDelayCost * 21, 8)
    expect(m.weeklyDelayCost).toBeCloseTo(m.dailyDelayCost * 7, 8)
    expect(m.monthlyDelayCost).toBeCloseTo(m.dailyDelayCost * 30, 8)
    expect(m.profitErosionPercent).toBeCloseTo((m.totalDelayCost / 40_000) * 100, 6)
    expect(m.portfolioDelayCost).toBeNull()
  })

  it("returns null profit erosion when expected profit is zero", () => {
    const m = calculateDelayMetrics({
      ...getDefaultDelayCalculatorInputs(),
      expectedGrossProfit: 0,
    })
    expect(m.profitErosionPercent).toBeNull()
  })

  it("computes portfolio when activeHomes set", () => {
    const m = calculateDelayMetrics({
      ...getDefaultDelayCalculatorInputs(),
      activeHomes: 4,
    })
    expect(m.portfolioDelayCost).toBeCloseTo(m.totalDelayCost * 4, 4)
  })

  it("clamps negatives to zero", () => {
    const m = calculateDelayMetrics({
      loanAmount: -1000,
      annualInterestRate: -5,
      monthlyOverhead: -100,
      monthlyHolding: -50,
      expectedGrossProfit: -1,
      delayDays: -10,
      activeHomes: null,
    })
    expect(m.dailyDelayCost).toBeGreaterThanOrEqual(0)
    expect(m.totalDelayCost).toBe(0)
  })
})
