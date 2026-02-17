/**
 * Runtime validation for getBaseUrl() and ensureAbsoluteInviteUrl().
 * Run: npx tsx scripts/validate-url.ts
 *
 * Tests:
 * - APP_URL='http://localhost:3000' => http://localhost:3000
 * - APP_URL='"https://usephase.app"' => https://usephase.app
 * - APP_URL='usephase.app' => https://usephase.app
 * - APP_URL='https' => invalid -> fallback in dev / throw in prod
 * - relative '/auth/accept-invite?token=abc' => https://usephase.app/auth/accept-invite?token=abc (with base set)
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/placeholder"
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://localhost:5432/placeholder"

const NODE_ENV_ORIG = process.env.NODE_ENV
const APP_URL_ORIG = process.env.APP_URL
const NEXT_PUBLIC_ORIG = process.env.NEXT_PUBLIC_APP_URL
const NEXTAUTH_ORIG = process.env.NEXTAUTH_URL

function resetEnv() {
  process.env.NODE_ENV = NODE_ENV_ORIG
  process.env.APP_URL = APP_URL_ORIG
  process.env.NEXT_PUBLIC_APP_URL = NEXT_PUBLIC_ORIG
  process.env.NEXTAUTH_URL = NEXTAUTH_ORIG
}

async function run() {
  const { getBaseUrl, ensureAbsoluteInviteUrl } = await import("../lib/url")
  let passed = 0
  let failed = 0

  // 1) APP_URL='http://localhost:3000' => http://localhost:3000
  delete process.env.APP_URL
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.NEXTAUTH_URL
  process.env.APP_URL = "http://localhost:3000"
  const u1 = getBaseUrl()
  if (u1 === "http://localhost:3000") {
    console.log("PASS: APP_URL=http://localhost:3000 =>", u1)
    passed++
  } else {
    console.error("FAIL: expected http://localhost:3000, got", u1)
    failed++
  }

  // 2) APP_URL='"https://usephase.app"' => https://usephase.app
  process.env.APP_URL = '"https://usephase.app"'
  const u2 = getBaseUrl()
  if (u2 === "https://usephase.app") {
    console.log("PASS: APP_URL=\"\\\"https://usephase.app\\\"\" =>", u2)
    passed++
  } else {
    console.error("FAIL: expected https://usephase.app, got", u2)
    failed++
  }

  // 3) APP_URL='usephase.app' => https://usephase.app
  process.env.APP_URL = "usephase.app"
  const u3 = getBaseUrl()
  if (u3 === "https://usephase.app") {
    console.log("PASS: APP_URL=usephase.app =>", u3)
    passed++
  } else {
    console.error("FAIL: expected https://usephase.app, got", u3)
    failed++
  }

  // 4) APP_URL='https' => invalid -> fallback in dev
  process.env.APP_URL = "https"
  process.env.NODE_ENV = "development"
  const u4 = getBaseUrl()
  if (u4 === "http://localhost:3000") {
    console.log("PASS: APP_URL=https (dev) => fallback", u4)
    passed++
  } else {
    console.error("FAIL: expected fallback http://localhost:3000, got", u4)
    failed++
  }

  // 5) relative inviteLink with base usephase.app
  process.env.APP_URL = "https://usephase.app"
  process.env.NODE_ENV = NODE_ENV_ORIG
  const relative = "/auth/accept-invite?token=abc"
  const full = ensureAbsoluteInviteUrl(relative)
  const expected = "https://usephase.app/auth/accept-invite?token=abc"
  if (full === expected && !full.includes('"')) {
    console.log("PASS: relative", relative, "=>", full)
    passed++
  } else {
    console.error("FAIL: expected", expected, ", got", full)
    failed++
  }

  resetEnv()
  console.log("")
  console.log("Result:", passed, "passed,", failed, "failed")
  if (failed > 0) process.exit(1)
}

run().catch((e) => {
  resetEnv()
  console.error(e)
  process.exit(1)
})
