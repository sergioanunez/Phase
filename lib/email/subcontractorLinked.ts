import { Resend } from "resend"

type Params = {
  to: string
  name: string
  tenantName: string
  appUrl: string
}

function getServerAppUrl(raw?: string | null): string {
  const env = (raw ?? process.env.APP_URL ?? "").trim().replace(/^['"]|['"]$/g, "")
  if (!env) return "https://usephase.app"
  if (!/^https?:\/\//i.test(env)) {
    return `https://${env}`
  }
  return env
}

export async function sendSubcontractorLinkedEmail({ to, name, tenantName, appUrl }: Params) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    console.warn("Resend env vars missing, skipping subcontractor linked email")
    return
  }

  const resend = new Resend(apiKey)
  const baseUrl = getServerAppUrl(appUrl)
  const url = `${baseUrl.replace(/\/+$/, "")}/subcontractor`

  const subject = `${tenantName} added you on Phase`

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5;">
      <p>Hi ${name || ""},</p>
      <p><strong>${tenantName}</strong> linked you to their Phase account.</p>
      <p>You can now view schedules and punch lists for ${tenantName} whenever you sign in.</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="display: inline-block; padding: 10px 18px; background: #2563eb; color: #ffffff; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Open Phase
        </a>
      </p>
      <p>If you did not expect this email, you can ignore it.</p>
    </div>
  `

  await resend.emails.send({
    from,
    to,
    subject,
    html,
  })
}

