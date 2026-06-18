/** Internal domain for SMS-only invites (user sets real email at accept). */
export const SYNTHETIC_INVITE_EMAIL_DOMAIN = "sms.usephase.app"

export function isSyntheticInviteEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const lower = email.trim().toLowerCase()
  return (
    lower.endsWith(`@${SYNTHETIC_INVITE_EMAIL_DOMAIN}`) &&
    lower.startsWith("invite+")
  )
}

/** Stable placeholder email for SMS-only invites; unique per E.164 number. */
export function syntheticInviteEmailFromPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "")
  return `invite+${digits}@${SYNTHETIC_INVITE_EMAIL_DOMAIN}`
}
