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
 * Build invite link with URL() only (no string concat).
 * baseUrl must come from getBaseUrl() or getServerAppUrl() so it is already sanitized.
 */
export function buildInviteLink(baseUrl: string, token: string): string {
  const url = new URL("/auth/accept-invite", baseUrl)
  url.searchParams.set("token", token)
  return url.toString()
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
  /** Name of the tenant company inviting the user (e.g. "Cullers Homes") */
  invitingCompanyName?: string
}): Promise<{ ok: boolean; error?: string; rateLimit?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY
  const { ensureAbsoluteInviteUrl } = await import("./url")
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"

  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set" }
  }

  try {
    const { Resend } = await import("resend")
    const resend = new Resend(apiKey)
    const fullUrl = ensureAbsoluteInviteUrl(params.inviteLink)

    const expiryStr = params.expiresAt.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })

    const appName = process.env.APP_NAME || "Phase"
    const supportContact = process.env.SUPPORT_EMAIL || "your project administrator"
    const invitingText = params.invitingCompanyName
      ? `${params.invitingCompanyName} has invited you to join `
      : "You've been invited to join "

    // Escape for HTML href: & " and ' so attribute is well-formed
    const urlForHref = fullUrl
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
    const safeLinkText = fullUrl
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

    const htmlContent = `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #1f2937;">
          <p style="font-size: 16px; line-height: 1.5;">Hi ${params.name},</p>
          <p style="font-size: 16px; line-height: 1.5;">${invitingText}<strong>${appName}</strong> to view and manage your scheduled work. Click the button below to set your password and activate your account.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;">
            <tr>
              <td style="border-radius: 8px; background-color: #2563eb;">
                <a href="${urlForHref}" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">Set up your password</a>
              </td>
            </tr>
          </table>
          <p style="color: #6b7280; font-size: 12px; line-height: 1.5;">If the button doesn&apos;t work, copy and paste this link into your browser:</p>
          <p style="font-size: 12px; line-height: 1.5; word-break: break-all;"><a href="${urlForHref}" style="color: #2563eb;">${safeLinkText}</a></p>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">This link is valid for 48 hours and expires at ${expiryStr}. Use it only once.</p>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">If you didn&apos;t expect this email, you can ignore it. For help, contact ${supportContact}.</p>
        </div>
      `

    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `You're invited to ${appName} — set your password`,
      html: htmlContent,
      text: `Hi ${params.name},\n\n${invitingText}${appName} to view and manage your scheduled work. Set your password by clicking this link:\n\n${fullUrl}\n\nThis link is valid for 48 hours. If you didn't expect this email, you can ignore it.`,
    })

    if (error) {
      const msg = error.message || ""
      const rateLimit =
        msg.toLowerCase().includes("rate limit") ||
        msg.includes("429") ||
        msg.toLowerCase().includes("quota exceeded") ||
        msg.toLowerCase().includes("too many requests")
      return { ok: false, error: msg, rateLimit: !!rateLimit }
    }
    return { ok: true }
  } catch (err: any) {
    const msg = err?.message || "Failed to send email"
    const rateLimit =
      msg.toLowerCase().includes("rate limit") ||
      msg.includes("429") ||
      msg.toLowerCase().includes("quota exceeded") ||
      msg.toLowerCase().includes("too many requests")
    return { ok: false, error: msg, rateLimit: !!rateLimit }
  }
}

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export type SendInviteEmailWithIdempotencyParams = {
  idempotencyKey: string
  companyId: string | null
  userId: string | null
  email: string
  to: string
  name: string
  inviteLink: string
  expiresAt: Date
  invitingCompanyName?: string
}

export type SendInviteEmailWithIdempotencyResult = {
  ok: boolean
  skipped?: boolean
  message?: string
  error?: string
  rateLimit?: boolean
}

/**
 * Send invite email with idempotency: if a successful send for the same key
 * happened in the last 5 minutes, skip Resend and return ok with message.
 * Logs every attempt to InviteEmailLog and returns real Resend errors.
 */
export async function sendInviteEmailWithIdempotency(
  prisma: { inviteEmailLog: { findFirst: any; create: any } },
  params: SendInviteEmailWithIdempotencyParams
): Promise<SendInviteEmailWithIdempotencyResult> {
  const { idempotencyKey, companyId, userId, email } = params

  console.log("[invite] idempotencyKey:", idempotencyKey)

  const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS)
  const recentSent = await prisma.inviteEmailLog.findFirst({
    where: {
      idempotencyKey,
      status: "SENT",
      createdAt: { gte: since },
    },
  })

  if (recentSent) {
    console.log("[invite] Skipping send: recent successful send within 5 min for key:", idempotencyKey)
    return {
      ok: true,
      skipped: true,
      message: "Invite already sent recently",
    }
  }

  const emailResult = await sendInviteEmail({
    to: params.to,
    name: params.name,
    inviteLink: params.inviteLink,
    expiresAt: params.expiresAt,
    invitingCompanyName: params.invitingCompanyName,
  })

  await prisma.inviteEmailLog.create({
    data: {
      companyId,
      userId,
      email,
      idempotencyKey,
      status: emailResult.ok ? "SENT" : "FAILED",
      errorMessage: emailResult.error ?? null,
    },
  })

  if (!emailResult.ok) {
    console.log("[invite] Resend error:", {
      idempotencyKey,
      error: emailResult.error,
      rateLimit: emailResult.rateLimit,
    })
  }

  return {
    ok: emailResult.ok,
    error: emailResult.error,
    rateLimit: emailResult.rateLimit,
  }
}
