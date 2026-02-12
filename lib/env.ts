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

