import type { NextRequest } from "next/server"
import NextAuth from "next-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")) {
    return new Response(JSON.stringify({ error: "Unavailable during build" }), { status: 503, headers: { "Content-Type": "application/json" } })
  }
  const { authOptions } = await import("@/lib/auth")
  const handler = NextAuth(authOptions)
  return handler(req, context)
}

export async function POST(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")) {
    return new Response(JSON.stringify({ error: "Unavailable during build" }), { status: 503, headers: { "Content-Type": "application/json" } })
  }
  const { authOptions } = await import("@/lib/auth")
  const handler = NextAuth(authOptions)
  return handler(req, context)
}
