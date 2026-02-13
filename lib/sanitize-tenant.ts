/**
 * Sanitize tenant slug from query/credentials so it is never "undefined", "null", or empty.
 * Safe to use on client (signin page) and server (NextAuth authorize).
 */
export function sanitizeTenantSlug(value: string | null | undefined): string | undefined {
  if (value == null) return undefined
  const s = String(value).trim()
  if (s === "" || s === "undefined" || s === "null") return undefined
  return s
}
