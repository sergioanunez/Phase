import webpush from "web-push"
import { prisma } from "@/lib/prisma"
import { getVapidPrivateKey, getVapidSubject, isWebPushConfigured } from "@/lib/web-push-config"

export type WebPushNotificationPayload = {
  title: string
  body: string
  icon?: string
  badge?: string
  /** Absolute or path-only URL to open on click */
  url: string
  type: "subcontractor_reply" | "flow_attention" | "punchlist"
  tag?: string
  metadata?: Record<string, string | undefined>
}

let configured = false

function ensureVapid(): boolean {
  if (!isWebPushConfigured()) return false
  if (configured) return true
  webpush.setVapidDetails(
    getVapidSubject(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
    getVapidPrivateKey()!
  )
  configured = true
  return true
}

/**
 * Send one web push; deactivate subscription on 404/410.
 */
export async function sendWebPushToSubscription(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: WebPushNotificationPayload
): Promise<{ ok: boolean; error?: string }> {
  if (!ensureVapid()) {
    return { ok: false, error: "VAPID not configured" }
  }
  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  }
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/icon-192.png",
    badge: payload.badge ?? "/icon-192.png",
    url: payload.url,
    type: payload.type,
    tag: payload.tag,
    metadata: payload.metadata ?? {},
  })
  try {
    await webpush.sendNotification(pushSubscription, body, {
      TTL: 3600,
      urgency: "normal",
    })
    return { ok: true }
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 404 || status === 410) {
      await prisma.webPushSubscription.updateMany({
        where: { id: sub.id },
        data: { isActive: false },
      })
    }
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}
