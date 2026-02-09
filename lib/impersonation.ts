import { cookies } from "next/headers"
import { Session } from "next-auth"
import { prisma } from "./prisma"
import type { TenantContext } from "./tenant"
import { UserRole } from "@prisma/client"

const IMPERSONATION_COOKIE = "buildflow_impersonation"

type CookiePayload = {
  companyId: string
  companyName: string
  userId: string
  userName: string
  userEmail: string
  role: string
}

/**
 * If the current user is SUPER_ADMIN and has an active impersonation cookie,
 * returns the impersonated user's TenantContext so all app queries run as that user.
 * Otherwise returns null (use normal session).
 */
export async function getEffectiveAuthContext(
  session: Session | null
): Promise<TenantContext | null> {
  if (!session?.user?.id || (session.user as { role?: string }).role !== "SUPER_ADMIN") {
    return null
  }

  const cookieStore = await cookies()
  const raw = cookieStore.get(IMPERSONATION_COOKIE)?.value
  if (!raw) return null

  let decoded: CookiePayload
  try {
    decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as CookiePayload
  } catch {
    return null
  }

  if (!decoded.userId || !decoded.companyId) return null

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      companyId: true,
      role: true,
      contractorId: true,
      company: { select: { name: true } },
    },
  })

  if (!user || user.companyId !== decoded.companyId) return null

  return {
    userId: user.id,
    companyId: user.companyId!,
    role: user.role as UserRole,
    contractorId: user.contractorId,
    companyName: user.company?.name,
  }
}
