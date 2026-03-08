/**
 * Phone normalization for bulk import.
 * Re-exports the shared E.164 normalizer used across the app.
 */
import { parseAndNormalizePhone as normalize } from "@/lib/phone"

export function normalizePhone(input: string): string | null {
  return normalize(input)
}
