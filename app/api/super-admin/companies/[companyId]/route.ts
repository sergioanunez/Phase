import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/super-admin"
import { createSuperAdminAuditLog } from "@/lib/audit"
import { z } from "zod"

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "TRIAL", "DISABLED", "PAST_DUE"]).optional(),
  pricingTier: z.enum(["SMALL", "MID", "LARGE", "WHITE_LABEL"]).optional(),
  maxActiveHomes: z.number().int().positive().nullable().optional(),
  timezone: z.string().nullable().optional(),
  monthlyPriceCents: z.number().int().nullable().optional(),
  renewalDate: z.string().datetime().nullable().optional(),
  billingStatus: z.enum(["OK", "PAST_DUE", "CANCELED"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  brandAppName: z.string().nullable().optional(),
  brandLogoUrl: z.string().nullable().optional(),
  brandPrimaryColor: z.string().nullable().optional(),
  brandAccentColor: z.string().nullable().optional(),
})

const MAX_ACTIVE_HOMES_BY_TIER: Record<string, number | null> = {
  SMALL: 25,
  MID: 100,
  LARGE: 500,
  WHITE_LABEL: null,
}

/**
 * GET /api/super-admin/companies/:companyId
 * Company detail with usage. SUPER_ADMIN only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error

  const { companyId } = await params
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      _count: { select: { users: true, homes: true, homeTasks: true } },
      users: { select: { id: true, name: true, email: true, role: true, status: true, isActive: true } },
    },
  })
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [homesCompleted30d, tasksScheduled30d, smsSent30d, smsFailed30d] = await Promise.all([
    prisma.homeTask.count({ where: { companyId, status: "Completed", completedAt: { gte: thirtyDaysAgo } } }),
    prisma.homeTask.count({ where: { companyId, scheduledDate: { not: null }, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.smsMessage.count({ where: { companyId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.smsMessage.count({ where: { companyId, status: "Failed", createdAt: { gte: thirtyDaysAgo } } }),
  ])

  const confirmationRate30d = smsSent30d > 0 ? Math.round((1 - smsFailed30d / smsSent30d) * 100) : null

  return NextResponse.json({
    ...company,
    usage: {
      activeHomes: company._count.homes,
      homesCompleted30d,
      tasksScheduled30d,
      smsSent30d,
      smsFailed30d,
      confirmationRate30d,
    },
  })
}

/**
 * PATCH /api/super-admin/companies/:companyId
 * Update company. SUPER_ADMIN only. All changes audited.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error
  const actorId = check.id

  const { companyId } = await params
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors?.[0] || "Invalid input"
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const data: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.pricingTier != null) {
    data.maxActiveHomes = MAX_ACTIVE_HOMES_BY_TIER[parsed.data.pricingTier] ?? company.maxActiveHomes
  }
  if (parsed.data.renewalDate != null) {
    data.renewalDate = parsed.data.renewalDate ? new Date(parsed.data.renewalDate) : null
  }

  const before = { ...company }
  const updated = await prisma.company.update({
    where: { id: companyId },
    data: data as never,
  })

  await createSuperAdminAuditLog(actorId, "COMPANY_UPDATED", {
    companyId,
    before: { name: before.name, status: before.status, pricingTier: before.pricingTier, maxActiveHomes: before.maxActiveHomes },
    after: { name: updated.name, status: updated.status, pricingTier: updated.pricingTier, maxActiveHomes: updated.maxActiveHomes },
  }, companyId, "Company", companyId)

  return NextResponse.json(updated)
}

/**
 * DELETE /api/super-admin/companies/:companyId
 * Delete company and related data. SUPER_ADMIN only. Audited.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const check = await requireSuperAdmin()
  if ("error" in check) return check.error
  const actorId = check.id

  const { companyId } = await params
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  await createSuperAdminAuditLog(actorId, "COMPANY_DELETED", {
    companyId,
    name: company.name,
  }, companyId, "Company", companyId)

  await prisma.company.delete({ where: { id: companyId } })
  return NextResponse.json({ success: true })
}
