import type { NextRequest } from "next/server"
import NextAuth from "next-auth"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/** Redirect to signin with error param without loading auth/DB (avoids 500 on this path). */
function redirectAuthError(req: NextRequest): Response {
  try {
    const error = req.nextUrl.searchParams.get("error") ?? "Default"
    const callbackUrl = req.nextUrl.searchParams.get("callbackUrl")
    const signin = new URL("/auth/signin", req.url)
    signin.searchParams.set("error", error)
    if (callbackUrl) signin.searchParams.set("callbackUrl", callbackUrl)
    return Response.redirect(signin, 302)
  } catch {
    return Response.redirect(new URL("/auth/signin", req.nextUrl.origin), 302)
  }
}

function isAuthErrorPath(pathname: string): boolean {
  return pathname === "/api/auth/error" || pathname.endsWith("/api/auth/error")
}

function authErrorResponse(message: string): Response | null {
  if (
    message.includes("Can't reach database server") ||
    message.includes("P1001") ||
    message.includes("PrismaClientInitializationError")
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Database connection misconfigured: check that DATABASE_URL uses the Supabase transaction pooler (port 6543) with ?sslmode=require&pgbouncer=true and DIRECT_URL uses the primary database URL (port 5432, sslmode=require).",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    )
  }
  if (message.includes("Tenant or user not found") || message.includes("FATAL:")) {
    return new Response(
      JSON.stringify({
        error:
          "Database authentication or tenant configuration issue. Ensure migrations and seed have been run and connection settings are correct.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    )
  }
  return null
}

export async function GET(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (isBuildTime) return buildGuardResponse()
  if (isAuthErrorPath(req.nextUrl.pathname)) return redirectAuthError(req)
  const { authOptions } = await import("@/lib/auth")
  const handler = NextAuth(authOptions)
  try {
    const res = await handler(req, context)
    return res
  } catch (error) {
    const msg = (error as Error)?.message ?? ""
    const res = authErrorResponse(msg)
    if (res) return res
    throw error
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (isBuildTime) return buildGuardResponse()
  if (isAuthErrorPath(req.nextUrl.pathname)) return redirectAuthError(req)
  const { authOptions } = await import("@/lib/auth")
  const handler = NextAuth(authOptions)
  try {
    const res = await handler(req, context)
    return res
  } catch (error) {
    const msg = (error as Error)?.message ?? ""
    const res = authErrorResponse(msg)
    if (res) return res
    throw error
  }
}
