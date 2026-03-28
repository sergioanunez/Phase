import type { DelayMetrics } from "./types"
import { formatCurrency } from "./format"

export function generateDynamicInsight(totalDelayCost: number): string {
  if (totalDelayCost < 1000) {
    return "Even a relatively short delay creates real cost that is easy to overlook."
  }
  if (totalDelayCost < 3000) {
    return "This is already enough to meaningfully chip away at the margin on this home."
  }
  if (totalDelayCost < 5000) {
    return "This is equivalent to a meaningful slice of your margin on this home."
  }
  return "This level of delay can erase a significant portion of profit if it becomes a pattern."
}

export function generateShareSummary(
  metrics: DelayMetrics,
  delayDays: number,
  activeHomes: number | null
): string {
  const daily = formatCurrency(metrics.dailyDelayCost)
  const monthly = formatCurrency(metrics.monthlyDelayCost)
  const total = formatCurrency(metrics.totalDelayCost)
  let text = `We're losing about ${daily}/day per home due to delays, or about ${monthly}/month. This delay scenario costs about ${total} over ${delayDays} days.`
  if (activeHomes != null && activeHomes > 0 && metrics.portfolioDelayCost != null) {
    text += ` Across ${activeHomes} active homes, that pattern would cost about ${formatCurrency(metrics.portfolioDelayCost)}.`
  }
  return text
}
