/**
 * VAPID configuration for Web Push. Set in environment (generate with `npx web-push generate-vapid-keys`).
 */
export function getVapidPublicKey(): string | null {
  const k = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  return k || null
}

export function getVapidPrivateKey(): string | null {
  const k = process.env.VAPID_PRIVATE_KEY?.trim()
  return k || null
}

/** mailto: or https: URL required by web-push */
export function getVapidSubject(): string {
  const s = process.env.VAPID_SUBJECT?.trim()
  if (s) return s
  const url = process.env.NEXTAUTH_URL?.trim()
  if (url) return url
  return "mailto:support@usephase.app"
}

export function isWebPushConfigured(): boolean {
  return !!(getVapidPublicKey() && getVapidPrivateKey())
}
