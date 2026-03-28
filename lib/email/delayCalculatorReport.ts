import { Resend } from "resend"
import type { DelayCalculatorInputs, DelayMetrics } from "@/lib/delay-cost-calculator/types"
import { generateEmailHtml, generateEmailText } from "@/lib/delay-cost-calculator/email-templates"
import { getBaseUrl } from "@/lib/url"

export type SendDelayCalculatorReportParams = {
  to: string
  firstName?: string | null
  inputs: DelayCalculatorInputs
  metrics: DelayMetrics
  /** primary = full report subject; passive = tools-oriented subject */
  formVariant?: "primary" | "passive" | null
}

/**
 * Sends the delay calculator report via Resend.
 *
 * Environment variables:
 * - RESEND_API_KEY — required for outbound email (omit in dev to test DB-only capture).
 * - RESEND_FROM_EMAIL — verified sender in Resend (default: onboarding@resend.dev).
 * - APP_URL / NEXT_PUBLIC_APP_URL / NEXTAUTH_URL — used for “Learn more” links in the email.
 * - MARKETING_LEAD_NOTIFY_EMAIL or PHASE_LEAD_NOTIFICATION_EMAIL — optional internal inbox
 *   to receive a short text copy when someone submits the calculator.
 *
 * Rate limiting: not implemented here; add middleware or a shared limiter (e.g. Redis) when needed.
 */
export async function sendDelayCalculatorReport(
  params: SendDelayCalculatorReportParams
): Promise<{ ok: true } | { ok: false; error: string; rateLimit?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"

  if (!apiKey) {
    return { ok: false, error: "Email is not configured (RESEND_API_KEY)." }
  }

  let learnMoreUrl: string
  try {
    learnMoreUrl = `${getBaseUrl().replace(/\/$/, "")}/`
  } catch {
    learnMoreUrl = "https://usephase.app/"
  }

  const subject =
    params.formVariant === "passive"
      ? "Phase — practical tools for homebuilders"
      : "Your Delay Cost Breakdown"

  const html = generateEmailHtml({
    firstName: params.firstName,
    inputs: params.inputs,
    metrics: params.metrics,
    learnMoreUrl,
  })
  const text = generateEmailText({
    firstName: params.firstName,
    inputs: params.inputs,
    metrics: params.metrics,
    learnMoreUrl,
  })

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
      text,
    })

    if (error) {
      const msg = error.message || "Failed to send email"
      const rateLimit =
        msg.toLowerCase().includes("rate limit") ||
        msg.includes("429") ||
        msg.toLowerCase().includes("quota")
      return { ok: false, error: msg, rateLimit: !!rateLimit }
    }

    const notify =
      process.env.MARKETING_LEAD_NOTIFY_EMAIL?.trim() ||
      process.env.PHASE_LEAD_NOTIFICATION_EMAIL?.trim()
    if (notify) {
      void resend.emails
        .send({
          from,
          to: notify,
          subject: `[Lead] Delay calculator — ${params.to}`,
          text: `New submission (${params.formVariant ?? "primary"})\nEmail: ${params.to}\nFirst name: ${params.firstName ?? ""}\nDelay days: ${params.inputs.delayDays}\nTotal delay cost: ${params.metrics.totalDelayCost}`,
        })
        .catch((err) => console.error("[delay-calculator] notify email failed", err))
    }

    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send email"
    return { ok: false, error: msg }
  }
}
