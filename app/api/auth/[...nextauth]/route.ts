import type { NextRequest } from "next/server"
import NextAuth from "next-auth"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (isBuildTime) return buildGuardResponse()
  const { authOptions } = await import("@/lib/auth")
  const handler = NextAuth(authOptions)
  return handler(req, context)
}

export async function POST(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (isBuildTime) return buildGuardResponse()
  const { authOptions } = await import("@/lib/auth")
  const handler = NextAuth(authOptions)
  return handler(req, context)
}
