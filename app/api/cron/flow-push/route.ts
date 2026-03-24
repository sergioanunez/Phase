import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { prisma } from "@/lib/prisma"
import { computeFlow } from "@/lib/flow/computeFlow"
import { dispatchWebPushFlowAttention } from "@/lib/web-push-dispatch"
import type { UserRole } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300
export const fetchCache = "force-no-store"

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const auth = request.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return true
  if (request.headers.get("x-cron-secret") === secret) return true
  return false
}

async function runFlowPushJob() {
  const subs = await prisma.webPushSubscription.findMany({
    where: {
      isActive: true,
      user: {
        isActive: true,
        status: "ACTIVE",
        role: { in: ["Admin", "Manager", "Superintendent"] },
        companyId: { not: null },
      },
    },
    select: {
      userId: true,
      companyId: true,
      user: {
        select: { role: true, companyId: true },
      },
    },
  })

  const targets = new Map<string, { userId: string; companyId: string; role: UserRole }>()
  for (const s of subs) {
    if (!s.user.companyId || s.user.companyId !== s.companyId) continue
    const key = `${s.userId}:${s.companyId}`
    if (!targets.has(key)) {
      targets.set(key, {
        userId: s.userId,
        companyId: s.companyId,
        role: s.user.role,
      })
    }
  }

  let skippedPrefs = 0
  let skippedNoAttention = 0
  let dispatchInvoked = 0
  let errors = 0

  for (const t of targets.values()) {
    try {
      const prefs = await prisma.userWebPushPreference.findUnique({
        where: { userId_companyId: { userId: t.userId, companyId: t.companyId } },
      })
      if (prefs && (!prefs.enabled || !prefs.notifyFlowAlerts)) {
        skippedPrefs++
        continue
      }

      const result = await computeFlow({
        companyId: t.companyId,
        userId: t.userId,
        role: t.role,
        scope: "today",
        filter: "all",
        search: undefined,
      })

      const attention = result.actions.filter(
        (a) =>
          a.isOverdue ||
          (typeof a.slackWorkingDays === "number" && a.slackWorkingDays < 0)
      )
      const attentionHomeIds = new Set(attention.map((a) => a.homeId))

      if (attention.length === 0) {
        skippedNoAttention++
        continue
      }

      await dispatchWebPushFlowAttention({
        companyId: t.companyId,
        targetUserId: t.userId,
        attentionTaskIds: attention.map((a) => a.taskId),
        attentionHomeCount: attentionHomeIds.size,
      })
      dispatchInvoked++
    } catch (e) {
      console.error("[cron] flow-push user", t.userId, e)
      errors++
    }
  }

  return {
    ok: true as const,
    usersScanned: targets.size,
    dispatchInvoked,
    skippedPrefs,
    skippedNoAttention,
    errors,
  }
}

export async function GET(request: NextRequest) {
  if (isBuildTime) return buildGuardResponse()
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set. Add it to run scheduled Flow push." },
      { status: 503 }
    )
  }
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await runFlowPushJob()
  return NextResponse.json(body)
}

export async function POST(request: NextRequest) {
  return GET(request)
}
