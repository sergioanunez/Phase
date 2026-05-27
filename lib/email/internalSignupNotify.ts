import { Resend } from "resend"

export type InternalSignupNotifyParams = {
  name: string
  email: string
  role?: string | null
  companyName?: string | null
  signupSource?: string | null
  signedUpAt?: Date
}

function formatSignupTimestamp(date: Date): string {
  const timeZone = process.env.APP_TIMEZONE || "America/New_York"
  return date.toLocaleString("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  })
}

function resolveFromAddress(): string {
  const from =
    process.env.FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Phase <no-reply@usephase.app>"
  return from
}

function resolveNotifyRecipient(): string {
  return (
    process.env.INTERNAL_SIGNUP_NOTIFY_EMAIL?.trim() || "sergio@usephase.app"
  )
}

export function buildInternalSignupNotifyText(params: InternalSignupNotifyParams): string {
  const signedUpAt = params.signedUpAt ?? new Date()
  const lines = [
    "New Phase signup",
    "",
    `Name: ${params.name?.trim() || "—"}`,
    `Email: ${params.email}`,
    `Company: ${params.companyName?.trim() || "—"}`,
    `Role: ${params.role?.trim() || "—"}`,
    `Source: ${params.signupSource?.trim() || "—"}`,
    `Signed up: ${formatSignupTimestamp(signedUpAt)}`,
  ]
  return lines.join("\n")
}

export function buildInternalSignupNotifyHtml(params: InternalSignupNotifyParams): string {
  const text = buildInternalSignupNotifyText(params)
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return `<pre style="font-family: ui-monospace, monospace; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${escaped}</pre>`
}

/**
 * Best-effort internal alert when a new user account is created (signup only).
 * Never throws; logs errors server-side.
 */
export async function notifyInternalNewSignup(
  params: InternalSignupNotifyParams
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(
      "[signup-notify] RESEND_API_KEY not set; skipping internal signup notification"
    )
    return
  }

  const to = resolveNotifyRecipient()
  const from = resolveFromAddress()

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to,
      subject: "New Phase signup",
      text: buildInternalSignupNotifyText(params),
      html: buildInternalSignupNotifyHtml(params),
    })

    if (error) {
      console.error("[signup-notify] Resend error:", error.message || error)
    }
  } catch (err) {
    console.error("[signup-notify] Failed to send internal notification:", err)
  }
}
