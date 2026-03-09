import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const res = NextResponse.next()
    res.headers.set("x-pathname", req.nextUrl.pathname)
    return res
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/auth/signin" },
  }
)

export const config = {
  matcher: ["/dashboard/:path*", "/calendar", "/flow", "/admin/:path*"],
}
