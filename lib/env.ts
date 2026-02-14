const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. ` +
        `For Supabase + Prisma, set DATABASE_URL to the transaction pooler (port 6543) with ?sslmode=require&pgbouncer=true, ` +
        `and DIRECT_URL to the primary database URL (port 5432, sslmode=require).`
    )
  }
  return value
}

export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  DIRECT_URL: requireEnv("DIRECT_URL"),
}

/**
 * Sanitize a URL string: trim, strip wrapping quotes, ensure scheme, no trailing slash.
 * Used so env vars like APP_URL="https://usephase.app" or NEXTAUTH_URL='"https://usephase.app"'
 * never produce broken links in emails.
 */
function sanitizeBaseUrl(value: string): string {
  let s = value.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  if (!s.startsWith("http://") && !s.startsWith("https://")) {
    s = "https://" + s.replace(/^\/*/, "")
  }
  return s.replace(/\/+$/, "")
}

/** Base URL for invite/email links. Use in API routes only. Prefer NEXT_PUBLIC_APP_URL so production links point to usephase.app, not localhost. */
export function getServerAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  return sanitizeBaseUrl(raw)
}

