import { parsePhoneNumberFromString } from "libphonenumber-js"

/**
 * Validate and normalize to E.164. Returns null if invalid.
 * Assumes US (+1) if no country code provided.
 */
export function parseAndNormalizePhone(input: string): string | null {
  const trimmed = (input ?? "").trim().replace(/\D/g, "")
  if (!trimmed.length) return null
  const withCountry = trimmed.length === 10 ? `+1${trimmed}` : trimmed.startsWith("1") ? `+${trimmed}` : `+1${trimmed}`
  const parsed = parsePhoneNumberFromString(withCountry, "US")
  if (!parsed || !parsed.isValid()) return null
  return parsed.format("E.164")
}

export function isValidPhone(input: string): boolean {
  return parseAndNormalizePhone(input) !== null
}

/** Last 10 US digits for comparing +1XXXXXXXXXX, XXXXXXXXXX, and formatted numbers. */
export function phoneDigits10(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "")
  return digits.length >= 10 ? digits.slice(-10) : digits
}

export function phonesMatch(a: string, b: string): boolean {
  const da = phoneDigits10(a)
  const db = phoneDigits10(b)
  return da.length === 10 && db.length === 10 && da === db
}
