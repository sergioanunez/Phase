import { NextRequest, NextResponse } from "next/server"
import { appendFileSync } from "fs"
import { join } from "path"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { computeHomeForecastAndPersist } from "@/lib/forecast"
import { homeTaskOrderByTemplateSequence } from "@/lib/work-template-display-order"

function debugLog(payload: Record<string, unknown>) {
  try {
    appendFileSync(join(process.cwd(), ".cursor", "debug.log"), JSON.stringify({ ...payload, timestamp: payload.timestamp ?? Date.now() }) + "\n")
  } catch {}
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/**
 * GET /api/homes/[id]/forecast
 * Recomputes forecast (longest dependency chain in working days from startDate),
 * persists to home + tasks, then returns the full home with tasks (same shape as GET /api/homes/[id]).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // #region agent log
  const forecastStart = Date.now()
  const { id: homeId } = await params
  debugLog({ location: "forecast/route.ts:GET", message: "forecast start", data: { step: "start", homeId, sinceStart: 0 }, timestamp: forecastStart, hypothesisId: "H2" })
  fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/api/homes/[id]/forecast/route.ts:GET",
      message: "forecast start",
      data: { step: "start", homeId, ms: forecastStart },
      timestamp: forecastStart,
      hypothesisId: "H2",
    }),
  }).catch(() => {})
  // #endregion
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    const homeForAccess = await prisma.home.findFirst({
      where: { id: homeId, companyId: ctx.companyId },
      include: {
        assignments: { select: { superintendentUserId: true } },
      },
    })

    if (!homeForAccess) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    if (ctx.role === "Superintendent") {
      const hasAccess = homeForAccess.assignments.some(
        (a) => a.superintendentUserId === ctx.userId
      )
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const previousForecast = homeForAccess.forecastCompletionDate
    await computeHomeForecastAndPersist(homeId)
    // #region agent log
    debugLog({ location: "forecast/route.ts:GET", message: "forecast after compute", data: { step: "afterCompute", homeId, sinceStart: Date.now() - forecastStart }, timestamp: Date.now(), hypothesisId: "H2" })
    fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "forecast/route.ts:GET", message: "forecast after compute", data: { step: "afterCompute", homeId, sinceStart: Date.now() - forecastStart }, timestamp: Date.now(), hypothesisId: "H2" }) }).catch(() => {})
    // #endregion

    const home = await prisma.home.findUnique({
      where: { id: homeId },
      include: {
        subdivision: true,
        tasks: {
          include: {
            contractor: true,
            templateItem: {
              select: {
                id: true,
                name: true,
                optionalCategory: true,
                isCriticalGate: true,
                gateName: true,
              },
            },
          },
          orderBy: [...homeTaskOrderByTemplateSequence()],
        },
        assignments: {
          include: {
            superintendent: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }
    // #region agent log
    debugLog({ location: "forecast/route.ts:GET", message: "forecast end", data: { step: "end", homeId, sinceStart: Date.now() - forecastStart }, timestamp: Date.now(), hypothesisId: "H2" })
    fetch("http://127.0.0.1:7242/ingest/e312e361-00a8-46be-b4af-dc6d93b8db2f", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "forecast/route.ts:GET", message: "forecast end", data: { step: "end", homeId, sinceStart: Date.now() - forecastStart }, timestamp: Date.now(), hypothesisId: "H2" }) }).catch(() => {})
    // #endregion

    const companyId = home.companyId
    if (
      companyId &&
      previousForecast &&
      home.forecastCompletionDate &&
      home.forecastCompletionDate > previousForecast
    ) {
      const { notifyForecastSlip } = await import("@/lib/notificationRules")
      await notifyForecastSlip({
        companyId,
        homeId: home.id,
        homeLabel: home.addressOrLot ?? "Home",
        previousForecast,
        newForecast: home.forecastCompletionDate,
      }).catch((err) => console.error("notifyForecastSlip:", err))
    }

    return NextResponse.json(home)
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Dependency cycle")) {
      return NextResponse.json(
        { error: error.message, forecastError: error.message },
        { status: 400 }
      )
    }
    return handleApiError(error)
  }
}
