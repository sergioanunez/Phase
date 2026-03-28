import type { DelayCalculatorInputs, DelayMetrics } from "./types"
import { clampNonNegative } from "./format"

const DEFAULT_INPUTS: DelayCalculatorInputs = {
  loanAmount: 300_000,
  annualInterestRate: 9,
  monthlyOverhead: 1200,
  monthlyHolding: 350,
  expectedGrossProfit: 40_000,
  delayDays: 21,
  activeHomes: null,
}

export function getDefaultDelayCalculatorInputs(): DelayCalculatorInputs {
  return { ...DEFAULT_INPUTS }
}

/**
 * Pure delay-cost math (USD, simple daily proration).
 */
export function calculateDelayMetrics(inputs: DelayCalculatorInputs): DelayMetrics {
  const loanAmount = clampNonNegative(inputs.loanAmount)
  const annualInterestRate = clampNonNegative(inputs.annualInterestRate)
  const monthlyOverhead = clampNonNegative(inputs.monthlyOverhead)
  const monthlyHolding = clampNonNegative(inputs.monthlyHolding)
  const expectedGrossProfit = clampNonNegative(inputs.expectedGrossProfit)
  const delayDays = clampNonNegative(Math.round(inputs.delayDays))
  const activeHomes =
    inputs.activeHomes != null && inputs.activeHomes > 0
      ? Math.min(Math.floor(inputs.activeHomes), 50_000)
      : null

  const dailyInterest = (loanAmount * (annualInterestRate / 100)) / 365
  const dailyOverhead = monthlyOverhead / 30
  const dailyHolding = monthlyHolding / 30
  const dailyDelayCost = dailyInterest + dailyOverhead + dailyHolding
  const totalDelayCost = dailyDelayCost * delayDays
  const weeklyDelayCost = dailyDelayCost * 7
  const monthlyDelayCost = dailyDelayCost * 30
  const profitErosionPercent =
    expectedGrossProfit > 0 ? (totalDelayCost / expectedGrossProfit) * 100 : null
  const portfolioDelayCost =
    activeHomes != null && activeHomes > 0 ? totalDelayCost * activeHomes : null

  return {
    dailyInterest,
    dailyOverhead,
    dailyHolding,
    dailyDelayCost,
    totalDelayCost,
    weeklyDelayCost,
    monthlyDelayCost,
    profitErosionPercent,
    portfolioDelayCost,
  }
}
