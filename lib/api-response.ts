import { NextResponse } from "next/server"

/** Turn thrown auth/tenant errors (with statusCode) into NextResponse. */
export function handleApiError(error: unknown): NextResponse {
  const err = error as Error & { statusCode?: number }
  const status = err.statusCode ?? 500
  const message = err.message || "Internal server error"
  return NextResponse.json({ error: message }, { status })
}
