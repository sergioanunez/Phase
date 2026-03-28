/**
 * Delay Cost Calculator — shared types for UI, API, and email.
 */

export type DelayCalculatorInputs = {
  loanAmount: number
  annualInterestRate: number
  monthlyOverhead: number
  monthlyHolding: number
  expectedGrossProfit: number
  delayDays: number
  activeHomes: number | null
}

export type DelayMetrics = {
  dailyInterest: number
  dailyOverhead: number
  dailyHolding: number
  dailyDelayCost: number
  totalDelayCost: number
  weeklyDelayCost: number
  monthlyDelayCost: number
  profitErosionPercent: number | null
  portfolioDelayCost: number | null
}
