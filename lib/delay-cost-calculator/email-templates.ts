import type { DelayCalculatorInputs, DelayMetrics } from "./types"
import { formatCurrency, formatCurrencyDetailed, formatPercent } from "./format"

const PHASE_LEARN_URL = "https://usephase.app/"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function greetingLine(firstName?: string | null): string {
  const trimmed = firstName?.trim()
  if (trimmed) return `Hi ${escapeHtml(trimmed)},`
  return "Hi there,"
}

export function generateEmailHtml(params: {
  firstName?: string | null
  inputs: DelayCalculatorInputs
  metrics: DelayMetrics
  learnMoreUrl?: string
}): string {
  const { inputs, metrics, firstName } = params
  const learnUrl = params.learnMoreUrl ?? PHASE_LEARN_URL
  const href = escapeHtml(learnUrl)

  const rows: { label: string; value: string }[] = [
    { label: "Cost per day", value: formatCurrencyDetailed(metrics.dailyDelayCost) },
    { label: `Cost for ${inputs.delayDays}-day delay`, value: formatCurrencyDetailed(metrics.totalDelayCost) },
    { label: "Weekly impact (7 days)", value: formatCurrencyDetailed(metrics.weeklyDelayCost) },
    { label: "30-day impact", value: formatCurrencyDetailed(metrics.monthlyDelayCost) },
  ]
  if (metrics.profitErosionPercent != null) {
    rows.push({
      label: "Estimated profit erosion",
      value: formatPercent(metrics.profitErosionPercent, 1),
    })
  }
  if (metrics.portfolioDelayCost != null && inputs.activeHomes != null && inputs.activeHomes > 0) {
    rows.push({
      label: `Across ${inputs.activeHomes} active homes`,
      value: formatCurrencyDetailed(metrics.portfolioDelayCost),
    })
  }

  const tableRows = rows
    .map(
      (r) =>
        `<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${escapeHtml(r.label)}</td>` +
        `<td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#111827;">${escapeHtml(r.value)}</td></tr>`
    )
    .join("")

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid #e5e7eb;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;">${greetingLine(firstName)}</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 8px;">Here's your delay cost breakdown.</p>
    <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 20px;">
      Based on your inputs, each day of delay is costing about <strong>${escapeHtml(formatCurrencyDetailed(metrics.dailyDelayCost))}</strong>,
      and a <strong>${inputs.delayDays}</strong>-day delay costs about <strong>${escapeHtml(formatCurrencyDetailed(metrics.totalDelayCost))}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
      ${tableRows}
    </table>
    <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 12px;">
      Most builders don't track this directly, which is why delays can feel small while compounding in the background.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 20px;">
      If this pattern is recurring, the root cause is often a combination of missed confirmations, unclear schedules,
      material timing gaps, and lack of field visibility.
    </p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      Phase is built to help homebuilders reduce these gaps through better scheduling, visibility, and field coordination.
      <a href="${href}" style="color:#2563eb;font-weight:600;">Learn more about Phase</a>
    </p>
    <p style="font-size:13px;line-height:1.5;color:#9ca3af;margin:24px 0 0;">More practical builder tools coming soon.</p>
  </div>
</body>
</html>
`.trim()
}

export function generateEmailText(params: {
  firstName?: string | null
  inputs: DelayCalculatorInputs
  metrics: DelayMetrics
  learnMoreUrl?: string
}): string {
  const { inputs, metrics, firstName } = params
  const learnUrl = params.learnMoreUrl ?? PHASE_LEARN_URL
  const nameLine = firstName?.trim() ? `Hi ${firstName.trim()},` : "Hi there,"

  const lines = [
    nameLine,
    "",
    "Here's your delay cost breakdown.",
    "",
    `Based on your inputs, each day of delay is costing about ${formatCurrencyDetailed(metrics.dailyDelayCost)}, and a ${inputs.delayDays}-day delay costs about ${formatCurrencyDetailed(metrics.totalDelayCost)}.`,
    "",
    "Key metrics:",
    `- Cost per day: ${formatCurrencyDetailed(metrics.dailyDelayCost)}`,
    `- Cost for delay period: ${formatCurrencyDetailed(metrics.totalDelayCost)}`,
    `- Weekly impact: ${formatCurrencyDetailed(metrics.weeklyDelayCost)}`,
    `- 30-day impact: ${formatCurrencyDetailed(metrics.monthlyDelayCost)}`,
  ]
  if (metrics.profitErosionPercent != null) {
    lines.push(`- Estimated profit erosion: ${formatPercent(metrics.profitErosionPercent, 1)}`)
  }
  if (metrics.portfolioDelayCost != null && inputs.activeHomes != null && inputs.activeHomes > 0) {
    lines.push(`- Across ${inputs.activeHomes} active homes: ${formatCurrencyDetailed(metrics.portfolioDelayCost)}`)
  }
  lines.push(
    "",
    "Most builders don't track this directly, which is why delays can feel small while compounding in the background.",
    "",
    "If this pattern is recurring, the root cause is often a combination of missed confirmations, unclear schedules, material timing gaps, and lack of field visibility.",
    "",
    `Phase is built to help homebuilders reduce these gaps. Learn more: ${learnUrl}`,
    "",
    "More practical builder tools coming soon."
  )
  return lines.join("\n")
}
