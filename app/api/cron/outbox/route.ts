import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { processOutboxBatch } from "@/lib/server-transactions/outbox-processor"
import { OUTBOX_TYPES } from "@/lib/server-transactions/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60
export const fetchCache = "force-no-store"

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const auth = request.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return true
  if (request.headers.get("x-cron-secret") === secret) return true
  return false
}

/**
 * Vercel Cron / protected internal trigger for durable outbox delivery.
 * Does not send real Twilio SMS in this phase; confirmation adapter is wired later.
 */
export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    if (!authorizeCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { prisma } = await import("@/lib/prisma")
    const result = await processOutboxBatch({
      prisma,
      workerId: `cron-outbox-${Date.now()}`,
      limit: 25,
      adapters: {
        [OUTBOX_TYPES.NO_OP_TEST_SIDE_EFFECT]: async (message) => ({
          providerReference: `test:${message.id}`,
        }),
        // SEND_CONFIRMATION_SMS intentionally has no adapter yet — permanently fails
        // until Phase scheduling migration registers the Twilio adapter.
      },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[cron/outbox]", error)
    return NextResponse.json({ error: "Outbox processing failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
