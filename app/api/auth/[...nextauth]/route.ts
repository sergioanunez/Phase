import type { NextRequest } from "next/server"
import NextAuth from "next-auth"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

/** Redirect to signin with error param without loading auth/DB (avoids 500 on this path). */
function redirectAuthError(req: NextRequest) {
  const error = req.nextUrl.searchParams.get("error") ?? "Default"
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl")
  const signin = new URL("/auth/signin", req.url)
  signin.searchParams.set("error", error)
  if (callbackUrl) signin.searchParams.set("callbackUrl", callbackUrl)
  return Response.redirect(signin, 302)
}

export async function GET(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (isBuildTime) return buildGuardResponse()
  const { nextauth: segments } = await context.params
  if (segments?.[0] === "error") return redirectAuthError(req)
  const { authOptions } = await import("@/lib/auth")
  const handler = NextAuth(authOptions)
  return handler(req, context)
}

export async function POST(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (isBuildTime) return buildGuardResponse()
  const { nextauth: segments } = await context.params
  if (segments?.[0] === "error") return redirectAuthError(req)
  const { authOptions } = await import("@/lib/auth")
  const handler = NextAuth(authOptions)
  return handler(req, context)
}
