import { NextRequest, NextResponse } from "next/server"
import { appendFileSync } from "fs"
import { join } from "path"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

function debugLog(payload: Record<string, unknown>) {
  try {
    appendFileSync(join(process.cwd(), ".cursor", "debug.log"), JSON.stringify({ ...payload, timestamp: payload.timestamp ?? Date.now() }) + "\n")
  } catch {}
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

// GET /api/homes/[id]/gates - Get gate statuses for a home
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // #region agent log
  const gatesStart = Date.now()
  debugLog({ location: "gates/route.ts:GET", message: "gates start", data: { step: "start", homeId: params.id, sinceStart: 0 }, timestamp: gatesStart, hypothesisId: "H3" })
  fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/api/homes/[id]/gates/route.ts:GET",
      message: "gates start",
      data: { step: "start", homeId: params.id, ms: gatesStart },
      timestamp: gatesStart,
      hypothesisId: "H3",
    }),
  }).catch(() => {})
  // #endregion
  try {
    if (isBuildTime) return buildGuardResponse()
    const { getServerSession } = await import("next-auth/next")
    const { authOptions } = await import("@/lib/auth")
    const { requirePermission } = await import("@/lib/rbac")
    const { getHomeGateStatus } = await import("@/lib/gates")

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await requirePermission("homes:read")

    const gateStatuses = await getHomeGateStatus(params.id)
    // #region agent log
    debugLog({ location: "gates/route.ts:GET", message: "gates end", data: { step: "end", homeId: params.id, sinceStart: Date.now() - gatesStart }, timestamp: Date.now(), hypothesisId: "H3" })
    fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "gates/route.ts:GET", message: "gates end", data: { step: "end", homeId: params.id, sinceStart: Date.now() - gatesStart }, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {})
    // #endregion

    return NextResponse.json(gateStatuses)
  } catch (error: any) {
    console.error("Error fetching gate statuses:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch gate statuses" },
      { status: 500 }
    )
  }
}
