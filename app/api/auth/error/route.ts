import { NextRequest } from "next/server"

/**
 * Handle /api/auth/error without loading NextAuth or Prisma.
 * Redirects to sign-in page with error param so the user sees the message there.
 * This avoids 500s when the main NextAuth handler would load auth/DB on this path.
 */
export async function GET(req: NextRequest) {
  const error = req.nextUrl.searchParams.get("error") ?? "Default"
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl")
  const signin = new URL("/auth/signin", req.url)
  signin.searchParams.set("error", error)
  if (callbackUrl) signin.searchParams.set("callbackUrl", callbackUrl)
  return Response.redirect(signin, 302)
}
