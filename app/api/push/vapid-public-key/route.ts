import { NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/web-push-config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Public VAPID public key for PushManager.subscribe (no auth).
 */
export async function GET() {
  if (isBuildTime) return buildGuardResponse()
  if (!isWebPushConfigured()) {
    return NextResponse.json({ configured: false, publicKey: null }, { status: 200 })
  }
  return NextResponse.json({ configured: true, publicKey: getVapidPublicKey() })
}
