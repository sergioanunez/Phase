import { createHash, randomBytes } from "crypto"

const INVITE_EXPIRY_HOURS = 48

/**
 * Generate a secure one-time token (32 bytes, base64url).
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url")
}

/**
 * Hash token for storage (sha256).
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

/**
 * Verify a plain token against a stored hash.
 */
export function verifyInviteToken(token: string, tokenHash: string): boolean {
  const hash = hashInviteToken(token)
  return hash === tokenHash && token.length > 0
}

/**
 * Invite link expiry (48 hours from now).
 */
export function getInviteExpiresAt(): Date {
  const d = new Date()
  d.setHours(d.getHours() + INVITE_EXPIRY_HOURS)
  return d
}

/**
 * Send invite email via Resend.
 * Requires RESEND_API_KEY and APP_URL.
 */
export async function sendInviteEmail(params: {
  to: string
  name: string
  inviteLink: string
  expiresAt: Date
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const { getServerAppUrl } = await import("./env")
  const appUrl = getServerAppUrl()
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"

  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set" }
  }

  try {
    const { Resend } = await import("resend")
    const resend = new Resend(apiKey)

    const expiryStr = params.expiresAt.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })

    const appName = process.env.APP_NAME || "Phase"
    const supportContact = process.env.SUPPORT_EMAIL || "your project administrator"

    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `You're invited to ${appName} — set your password`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #1f2937;">
          <p style="font-size: 16px; line-height: 1.5;">Hi ${params.name},</p>
          <p style="font-size: 16px; line-height: 1.5;">You've been invited to join <strong>${appName}</strong> to view and manage your scheduled work. Click the button below to set your password and activate your account.</p>
          <p style="margin: 28px 0;">
            <a href="${params.inviteLink}" style="display: inline-block; padding: 14px 28px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Set up your password</a>
          </p>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">This link is valid for 48 hours and expires at ${expiryStr}. Use it only once.</p>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">If you didn't expect this email, you can ignore it. For help, contact ${supportContact}.</p>
        </div>
      `,
    })

    if (error) {
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to send email" }
  }
}
