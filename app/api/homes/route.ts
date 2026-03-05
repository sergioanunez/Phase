import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const createHomeSchema = z.object({
  subdivisionId: z.string(),
  addressOrLot: z.string().min(1),
  startDate: z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => !v || v === "" || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/i.test(v),
      { message: "Start date must be YYYY-MM-DD or ISO datetime" }
    ),
  targetCompletionDate: z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => !v || v === "" || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/i.test(v),
      { message: "Target completion date must be YYYY-MM-DD or ISO datetime" }
    ),
})

export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { getAssignedHomeIdsForContractor } = await import("@/lib/tenant")
    const ctx = await requireTenantPermission("homes:read")

    const { searchParams } = new URL(request.url)
    const subdivisionId = searchParams.get("subdivisionId")

    const where: { companyId: string; subdivisionId?: string; id?: { in: string[] } } = {
      companyId: ctx.companyId,
    }
    if (subdivisionId) {
      where.subdivisionId = subdivisionId
    }

    // For Superintendent, filter by assignments
    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { companyId: ctx.companyId, superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      where.id = { in: assignments.map((a) => a.homeId) }
    }

    // For Subcontractor, only assigned homes
    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      const assignedHomeIds = await getAssignedHomeIdsForContractor(ctx.companyId, ctx.contractorId)
      if (assignedHomeIds.length === 0) {
        return NextResponse.json([])
      }
      where.id = { in: assignedHomeIds }
    }

    const homes = await prisma.home.findMany({
      where,
      include: {
        subdivision: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          select: {
            id: true,
            templateItemId: true,
            status: true,
            scheduledDate: true,
            completedAt: true,
            nameSnapshot: true,
            durationDaysSnapshot: true,
            contractor: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    const companyId = homes[0]?.companyId ?? ctx.companyId
    const templateDeps =
      companyId != null
        ? await prisma.templateDependency.findMany({
            where: { OR: [{ companyId }, { companyId: null }] },
            select: { templateItemId: true, dependsOnItemId: true },
          })
        : []

    const {
      computeHomeForecast,
      buildTaskNodesFromPrismaTasks,
      getHomeStart,
      workingDaysBetween,
    } = await import("@/lib/forecast")

    const serialized = homes.map((h) => {
      const { planStoragePath: _p, thumbnailStoragePath: _t, ...rest } = h
      let forecastCompletionDate = rest.forecastCompletionDate
      let forecastTotalWorkingDays = rest.forecastTotalWorkingDays
      if (h.tasks.length > 0) {
        try {
          const taskNodes = buildTaskNodesFromPrismaTasks(
            h.tasks.map((t) => ({
              id: t.id,
              templateItemId: t.templateItemId,
              nameSnapshot: t.nameSnapshot,
              durationDaysSnapshot: t.durationDaysSnapshot,
              status: t.status,
              scheduledDate: t.scheduledDate,
              completedAt: t.completedAt,
            })),
            templateDeps
          )
          const homeStart = getHomeStart(
            { startDate: h.startDate, createdAt: h.createdAt },
            h.tasks
          )
          const result = computeHomeForecast(taskNodes, homeStart)
          forecastCompletionDate = result.forecastDate
          forecastTotalWorkingDays =
            result.forecastDate > homeStart
              ? workingDaysBetween(homeStart, result.forecastDate)
              : 0
        } catch {
          // keep existing DB values on error (e.g. cycle)
        }
      }
      return {
        ...rest,
        forecastCompletionDate:
          forecastCompletionDate != null
            ? (typeof forecastCompletionDate === "string"
                ? forecastCompletionDate
                : new Date(forecastCompletionDate).toISOString())
            : null,
        forecastTotalWorkingDays: forecastTotalWorkingDays ?? rest.forecastTotalWorkingDays,
        hasPlan: !!h.planStoragePath,
        hasThumbnail: !!h.thumbnailStoragePath,
      }
    })
    return NextResponse.json(serialized)
  } catch (error: any) {
    console.error("Error fetching homes:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch homes", details: error.stack },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const { getTenantEntitlements, getTenantUsage } = await import("@/lib/entitlements")
    const ctx = await requireTenantPermission("homes:write")
    const body = await request.json()
    const data = createHomeSchema.parse(body)

    const { getBillingGates, UPGRADE_TITLE, UPGRADE_BODY } = await import("@/lib/billing/entitlements")
    const gates = await getBillingGates(prisma, ctx.companyId!)
    if (!gates.canCreateHomes) {
      return NextResponse.json(
        { error: UPGRADE_BODY, code: "TRIAL_ENDED", upgradeHint: "/admin/billing", title: UPGRADE_TITLE },
        { status: 403 }
      )
    }

    const company = await prisma.company.findFirst({
      where: { id: ctx.companyId },
      select: { status: true },
    })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }
    const subscriptionStatus = company.status
    if (subscriptionStatus !== "ACTIVE" && subscriptionStatus !== "TRIAL") {
      return NextResponse.json(
        {
          error:
            "Your account is not active. Please update your billing or contact support.",
          code: "SUBSCRIPTION_INACTIVE",
        },
        { status: 403 }
      )
    }

    const entitlements = await getTenantEntitlements(prisma, ctx.companyId!)
    const usage = await getTenantUsage(prisma, ctx.companyId!)
    const maxActiveHomes = entitlements.maxActiveHomes
    if (maxActiveHomes != null && maxActiveHomes !== -1 && usage.activeHomesCount >= maxActiveHomes) {
      return NextResponse.json(
        {
          error: `You've reached your plan limit of ${maxActiveHomes} active homes. Complete a home or upgrade your plan.`,
          code: "ACTIVE_HOMES_LIMIT",
          upgradeHint: "/admin/billing",
        },
        { status: 403 }
      )
    }

    // Verify subdivision belongs to tenant
    const subdivision = await prisma.subdivision.findFirst({
      where: { id: data.subdivisionId, companyId: ctx.companyId },
    })
    if (!subdivision) {
      return NextResponse.json({ error: "Subdivision not found" }, { status: 404 })
    }

    const home = await prisma.home.create({
      data: {
        companyId: ctx.companyId,
        subdivisionId: data.subdivisionId,
        addressOrLot: data.addressOrLot,
        startDate: data.startDate ? new Date(data.startDate) : null,
        targetCompletionDate: data.targetCompletionDate ? new Date(data.targetCompletionDate) : null,
      },
      include: {
        subdivision: true,
      },
    })

    await createAuditLog(ctx.userId, "Home", home.id, "CREATE", null, home, ctx.companyId)

    // Generate tasks from template (tenant-scoped)
    const templateItems = await prisma.workTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { sortOrder: "asc" },
    })

    await Promise.all(
      templateItems.map((item) =>
        prisma.homeTask.create({
          data: {
            companyId: ctx.companyId,
            homeId: home.id,
            templateItemId: item.id,
            nameSnapshot: item.name,
            durationDaysSnapshot: item.defaultDurationDays,
            sortOrderSnapshot: item.sortOrder,
            status: "Unscheduled",
          },
        })
      )
    )

    const { recalculateHomeCompletion } = await import("@/lib/home-completion")
    await recalculateHomeCompletion(prisma, home.id, ctx.companyId!)

    return NextResponse.json(home, { status: 201 })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const message =
        error.errors
          .map((e) => (e.path.length ? `${e.path.join(".")}: ${e.message}` : e.message))
          .join("; ") || "Invalid input"
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return handleApiError(error)
  }
}
