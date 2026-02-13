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

/** Base URL for invite/email links. Use in API routes only. Prefer NEXT_PUBLIC_APP_URL so production links point to usephase.app, not localhost. */
export function getServerAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  return raw.replace(/\/$/, "")
}

