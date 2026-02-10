import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * TEMPORARY: make forecast route a no-op so builds can't fail here.
 * Returns a minimal, safe payload without touching DB/auth.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json(
    {
      home: {
        id: params.id,
        addressOrLot: null,
        subdivision: null,
        startDate: null,
        targetCompletionDate: null,
        forecastCompletionDate: null,
      },
      tasks: [],
      forecastError: "Forecast temporarily disabled during deployment.",
    },
    { status: 200 }
  )
}

