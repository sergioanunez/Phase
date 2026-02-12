import { NextResponse } from "next/server"

/** Turn thrown auth/tenant errors (with statusCode) into NextResponse. */
export function handleApiError(error: unknown): NextResponse {
  const err = error as Error & { statusCode?: number }
  const status = err.statusCode ?? 500
  const message = err.message || "Internal server error"

  // Friendlier message for Prisma connection / configuration issues with Supabase.
  if (
    message.includes("Can't reach database server") ||
    message.includes("P1001") ||
    message.includes("PrismaClientInitializationError")
  ) {
    return NextResponse.json(
      {
        error:
          "Database connection misconfigured: check that DATABASE_URL uses the Supabase transaction pooler (port 6543) with ?sslmode=require&pgbouncer=true and DIRECT_URL uses the primary database URL (port 5432, sslmode=require).",
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ error: message }, { status })
}
