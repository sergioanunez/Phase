import { createHash, randomBytes } from "crypto"
import type { PrismaClient } from "@prisma/client"
import { parseAndNormalizePhone } from "@/lib/phone"
import { getBaseUrl } from "@/lib/url"

const TOKEN_EXPIRY_DAYS = 7

export function generateConfirmationAccessToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashConfirmationAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function getConfirmationAccessExpiresAt(from = new Date()): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + TOKEN_EXPIRY_DAYS)
  return d
}

export function buildConfirmationMagicLink(token: string, baseUrl = getBaseUrl()): string {
  return new URL(`/c/${encodeURIComponent(token)}`, baseUrl).toString()
}

export function normalizeConfirmationPhone(phone: string): string | null {
  return parseAndNormalizePhone(phone)
}

/**
 * Reuse a valid (unexpired, unrevoked) token for company+phone, or create a new one.
 * Returns the raw token for SMS / inbound replies (stored only as hash).
 */
export async function getOrCreateConfirmationAccessToken(
  prisma: PrismaClient,
  params: {
    companyId: string
    phone: string
    contractorId?: string | null
  }
): Promise<{ token: string; magicLink: string; created: boolean }> {
  const phoneNormalized = normalizeConfirmationPhone(params.phone)
  if (!phoneNormalized) {
    throw new Error("Invalid phone number for confirmation access token")
  }

  const now = new Date()
  const existing = await prisma.confirmationAccessToken.findFirst({
    where: {
      companyId: params.companyId,
      phoneNormalized,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  })

  if (existing) {
    // We cannot recover the raw token from the hash. Rotate to a fresh token
    // while revoking the prior row so only one active token exists.
    await prisma.confirmationAccessToken.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    })
  }

  const token = generateConfirmationAccessToken()
  const tokenHash = hashConfirmationAccessToken(token)
  await prisma.confirmationAccessToken.create({
    data: {
      companyId: params.companyId,
      tokenHash,
      phoneNormalized,
      contractorId: params.contractorId ?? null,
      expiresAt: getConfirmationAccessExpiresAt(now),
    },
  })

  return {
    token,
    magicLink: buildConfirmationMagicLink(token),
    created: true,
  }
}

/**
 * Like getOrCreate, but prefer returning a regenerated link whenever we must SMS it
 * (raw tokens are not recoverable). Always returns a usable magicLink.
 */
export async function issueConfirmationMagicLink(
  prisma: PrismaClient,
  params: {
    companyId: string
    phone: string
    contractorId?: string | null
  }
): Promise<{ token: string; magicLink: string }> {
  const issued = await getOrCreateConfirmationAccessToken(prisma, params)
  return { token: issued.token, magicLink: issued.magicLink }
}

export type LoadedConfirmationAccess =
  | { ok: true; companyId: string; phoneNormalized: string; tokenId: string; companyName: string }
  | { ok: false; reason: "invalid" | "expired" | "revoked" }

export async function loadConfirmationAccessByToken(
  prisma: PrismaClient,
  rawToken: string
): Promise<LoadedConfirmationAccess> {
  const token = (rawToken || "").trim()
  if (!token) return { ok: false, reason: "invalid" }

  const tokenHash = hashConfirmationAccessToken(token)
  const row = await prisma.confirmationAccessToken.findUnique({
    where: { tokenHash },
    include: {
      company: { select: { name: true, brandAppName: true } },
    },
  })

  if (!row) return { ok: false, reason: "invalid" }
  if (row.revokedAt) return { ok: false, reason: "revoked" }
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" }

  await prisma.confirmationAccessToken.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  })

  const companyName =
    (row.company.brandAppName || row.company.name || "Phase").trim() || "Phase"

  return {
    ok: true,
    companyId: row.companyId,
    phoneNormalized: row.phoneNormalized,
    tokenId: row.id,
    companyName,
  }
}
