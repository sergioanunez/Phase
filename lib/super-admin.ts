import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { NextResponse } from "next/server"

/**
 * Require SUPER_ADMIN role. Use in all /api/super-admin/* and /super-admin/*.
 * Returns session user or 401/403 response.
 */
export async function requireSuperAdmin(): Promise<
  { id: string; email: string; name: string; role: string } & { error?: never }
  | { error: NextResponse }
> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (session.user.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 }) }
  }
  return session.user as { id: string; email: string; name: string; role: string }
}
