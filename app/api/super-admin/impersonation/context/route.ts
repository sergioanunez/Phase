import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const IMPERSONATION_COOKIE = "buildflow_impersonation"

/**
 * GET /api/super-admin/impersonation/context
 * Returns current impersonation context if active (for banner). No SUPER_ADMIN check so banner can show.
 */
export async function GET() {
  if (isBuild()) return NextResponse.json({ active: false }, { status: 200 })
  const { getServerSession } = await import("next-auth")
  const { authOptions } = await import("@/lib/auth")
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ active: false })

  const cookieStore = await cookies()
  const raw = cookieStore.get(IMPERSONATION_COOKIE)?.value
  if (!raw) return NextResponse.json({ active: false })

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8"))
    return NextResponse.json({
      active: true,
      companyName: decoded.companyName,
      userName: decoded.userName,
      userId: decoded.userId,
      companyId: decoded.companyId,
      role: decoded.role,
    })
  } catch {
    return NextResponse.json({ active: false })
  }
}
