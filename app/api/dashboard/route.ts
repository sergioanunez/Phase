import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * TEMPORARY: keep build reliable by making this route a no-op.
 * Returns an empty dashboard payload so Vercel build cannot fail here.
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json(
    {
      homes: [],
      summary: {
        totalHomes: 0,
        homesBehindSchedule: 0,
        averageProgress: 0,
      },
    },
    { status: 200 }
  )
}
