/**
 * Formatting helpers for the Delay Cost Calculator.
 */

export function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0
  return n < 0 ? 0 : n
}

/**
 * Parse a numeric input (from form or JSON). Non-finite → fallback.
 */
export function sanitizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function formatCurrency(amount: number, locale = "en-US", currency = "USD"): string {
  if (!Number.isFinite(amount)) return "—"
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format currency with cents when useful (email detail rows).
 */
export function formatCurrencyDetailed(amount: number, locale = "en-US", currency = "USD"): string {
  if (!Number.isFinite(amount)) return "—"
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return `${value.toFixed(fractionDigits)}%`
}
