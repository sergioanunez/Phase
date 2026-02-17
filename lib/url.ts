/**
 * Robust base URL resolver for invite links and other absolute URLs.
 * Use getBaseUrl() everywhere we need the app origin (server-side).
 */

const DEV_DEFAULT = "http://localhost:3000"

function isDev(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === "development" ||
    process.env.VERCEL === "0"
  )
}

/**
 * Strip wrapping and escaped quotes from a string (for env values that may be quoted).
 */
function stripQuotes(s: string): string {
  let out = s.trim().replace(/\s/g, "")
  // Escaped quotes (e.g. \" or \')
  while (out.startsWith('\\"') || out.startsWith("\\'")) out = out.slice(2).trim()
  while (out.endsWith('"') || out.endsWith("'") || out.endsWith('\\"') || out.endsWith("\\'")) {
    if (out.endsWith('\\"') || out.endsWith("\\'")) out = out.slice(0, -2).trim()
    else out = out.slice(0, -1).trim()
  }
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1).trim().replace(/\s/g, "")
  }
  return out.replace(/\\+$/, "")
}

/**
 * Returns true if the trimmed value is clearly invalid as a base URL
 * (empty, or exactly "http" or "https" with nothing after the scheme).
 */
function isInvalidBaseUrlValue(s: string): boolean {
  const t = s.trim().toLowerCase()
  return t === "" || t === "http" || t === "https"
}

/**
 * Resolve the application base URL from environment variables.
 * Priority: APP_URL > NEXT_PUBLIC_APP_URL > NEXTAUTH_URL.
 *
 * - Trims whitespace and strips wrapping single/double quotes (and escaped quotes).
 * - If value starts with "https" but is missing "://", adds "://".
 * - If value does not start with http:// or https://, prefixes https://.
 * - Removes trailing slash.
 * - In dev, invalid or missing value fallback: http://localhost:3000.
 * - In production, invalid value (e.g. "https", "http", empty): logs error and throws.
 */
export function getBaseUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    ""

  let s = stripQuotes(raw)

  if (s === "") {
    if (isDev()) return DEV_DEFAULT
    console.error("[getBaseUrl] No APP_URL, NEXT_PUBLIC_APP_URL, or NEXTAUTH_URL set in production.")
    throw new Error(
      "Base URL is not configured. Set APP_URL or NEXT_PUBLIC_APP_URL (e.g. https://usephase.app) in production."
    )
  }

  if (isInvalidBaseUrlValue(s)) {
    if (isDev()) return DEV_DEFAULT
    console.error("[getBaseUrl] Invalid base URL value:", JSON.stringify(raw), "-> resolved to:", JSON.stringify(s))
    throw new Error(
      `Invalid base URL: env value resolved to "${s}". Use a full URL (e.g. https://usephase.app).`
    )
  }

  // Fix "https" or "http" without :// (e.g. typo "httpsusephase.app" -> we'll prefix later; "https" alone already caught above)
  if (s.startsWith("https") && !s.startsWith("https://")) {
    s = "https://" + s.replace(/^https/, "").replace(/^\/*/, "")
  } else if (s.startsWith("http") && !s.startsWith("http://") && !s.startsWith("https://")) {
    s = "http://" + s.replace(/^http/, "").replace(/^\/*/, "")
  }

  if (!s.startsWith("http://") && !s.startsWith("https://")) {
    s = "https://" + s.replace(/^\/*/, "")
  }

  s = s.replace(/\/+$/, "")

  if (isInvalidBaseUrlValue(s)) {
    if (isDev()) return DEV_DEFAULT
    console.error("[getBaseUrl] Base URL still invalid after normalize:", JSON.stringify(s))
    throw new Error("Invalid base URL after normalization.")
  }

  return s
}

/**
 * Sanitize a URL string: trim and remove any wrapping or internal stray quotes
 * that would make it invalid. Use for display/copy or before validation.
 */
export function sanitizeUrl(url: string): string {
  let s = url.trim()
  s = stripQuotes(s)
  // Remove any remaining quote characters that might have been in the middle
  s = s.replace(/["']/g, "")
  return s
}

/**
 * Ensure an invite link is a fully qualified absolute URL with no quotes.
 * - If inviteLink is relative (starts with "/"), prepends getBaseUrl().
 * - If already absolute, sanitizes (strip quotes, trim).
 * - Ensures the final URL contains no quotes and is valid for use in emails and UI.
 */
export function ensureAbsoluteInviteUrl(inviteLink: string): string {
  const baseUrl = getBaseUrl()
  let link = inviteLink.trim()
  link = stripQuotes(link)
  link = link.replace(/["']/g, "")

  if (link.startsWith("http://") || link.startsWith("https://")) {
    try {
      const u = new URL(link)
      return u.toString().replace(/\/+$/, "")
    } catch {
      // If URL parse fails (e.g. malformed), try prepending base and using path
      if (link.includes("/")) {
        const pathPart = link.replace(/^https?:\/\/[^/]*/, "") || "/"
        return new URL(pathPart.startsWith("/") ? pathPart : "/" + pathPart, baseUrl).toString().replace(/\/+$/, "")
      }
      return new URL("/auth/accept-invite", baseUrl).toString()
    }
  }

  const path = link.startsWith("/") ? link : "/" + link.replace(/^\.\/*/, "")
  const full = new URL(path, baseUrl)
  return full.toString().replace(/\/+$/, "")
}

/**
 * Validate that a string is a valid invite URL (absolute, no quotes).
 * Returns the sanitized URL if valid; throws with a clear message if not.
 */
export function validateInviteUrl(url: string): string {
  const sanitized = ensureAbsoluteInviteUrl(url)
  if (sanitized.includes('"') || sanitized.includes("'") || sanitized.includes("%22")) {
    throw new Error("Invite URL must not contain quotes.")
  }
  try {
    new URL(sanitized)
  } catch (e) {
    throw new Error("Invite URL is invalid: " + (e instanceof Error ? e.message : String(e)))
  }
  if (!sanitized.startsWith("http://") && !sanitized.startsWith("https://")) {
    throw new Error("Invite URL must be absolute (http or https).")
  }
  return sanitized
}
