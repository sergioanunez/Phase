import { getBaseUrl } from "@/lib/url"
import crypto from "crypto"

const TOKEN_BYTES = 24 // ~32 chars in base64url

/**
 * Generate a cryptographically random, URL-safe token for public punchlist links.
 * Length ~32 chars; impossible to guess.
 */
export function generatePublicPunchlistToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url")
}

/**
 * Build the full public punchlist URL for a given token.
 * Uses APP_URL / NEXT_PUBLIC_APP_URL (same as invite emails / billing).
 */
export function buildPublicPunchlistUrl(token: string): string {
  const base = getBaseUrl().replace(/\/+$/, "")
  return `${base}/punchlist/${encodeURIComponent(token)}`
}
