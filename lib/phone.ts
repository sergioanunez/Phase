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
