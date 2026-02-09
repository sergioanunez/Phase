import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

const PUBLIC_PATHS = ["/", "/contact", "/start-trial"]

export default withAuth(
  function middleware(req) {
    const pathname = req.nextUrl.pathname
    const res = NextResponse.next()
    res.headers.set("x-pathname", pathname)
    return res
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        if (req.nextUrl.pathname.startsWith("/auth")) return true
        if (PUBLIC_PATHS.includes(req.nextUrl.pathname)) return true
        return !!token
      },
    },
  }
)

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes - handled separately)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
}
