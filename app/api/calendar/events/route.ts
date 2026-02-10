import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * TEMPORARY: keep build reliable by making this route a no-op during build
 * and at runtime it just returns an empty list. Replace with real logic later.
 */
export async function GET(_request: NextRequest) {
  if (isBuildTime) return buildGuardResponse()
  return NextResponse.json([], { status: 200 })
}
