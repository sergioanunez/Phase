/**
 * Quick local test: build and log invite link (no email sent).
 * Ensures inviteLink looks like: https://usephase.app/auth/accept-invite?token=xxxx
 *
 * Usage: npx tsx scripts/test-invite-link.ts
 * Optional: set NEXT_PUBLIC_APP_URL (or NEXTAUTH_URL / APP_URL) before running to test your base URL.
 */

// Avoid requiring real DB when only testing invite link
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/placeholder"
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://localhost:5432/placeholder"
if (!process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXTAUTH_URL && !process.env.APP_URL) {
  process.env.NEXT_PUBLIC_APP_URL = "https://usephase.app"
}

async function main() {
  const { getServerAppUrl } = await import("../lib/env")
  const { buildInviteLink } = await import("../lib/invite")

  const base = getServerAppUrl()
  const token = "test-token-123"
  const inviteLink = buildInviteLink(base, token)

  console.log("Base URL:", base)
  console.log("Invite link:", inviteLink)

  const ok = /^https?:\/\/[^"\s]+\/auth\/accept-invite\?token=/.test(inviteLink)
    && !inviteLink.includes('"')
    && !inviteLink.includes("%22")
    && !inviteLink.includes("./")
  if (ok) {
    console.log("OK: Link format is valid.")
  } else {
    console.error("FAIL: Link is malformed (quotes, %22, or ./ present).")
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
