import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { fetchHomesForList } from "@/lib/homes/fetch-homes-list"
import { nextDisplayOrder } from "@/lib/display-order"
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
    const phaseFilter = searchParams.get("phase")

    const baseWhere: {
      OR: Array<{ companyId: string } | { companyId: null; subdivision: { companyId: string } }>
      subdivisionId?: string
      id?: { in: string[] }
    } = {
      OR: [
        { companyId: ctx.companyId },
        { companyId: null, subdivision: { companyId: ctx.companyId } },
      ],
    }
    if (subdivisionId) {
      baseWhere.subdivisionId = subdivisionId
    }

    // For Superintendent, filter by assignments
    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { companyId: ctx.companyId, superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      baseWhere.id = { in: assignments.map((a) => a.homeId) }
    }

    // For Subcontractor, only assigned homes
    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      const assignedHomeIds = await getAssignedHomeIdsForContractor(ctx.companyId, ctx.contractorId)
      if (assignedHomeIds.length === 0) {
        return NextResponse.json([])
      }
      baseWhere.id = { in: assignedHomeIds }
    }

    const homes = await fetchHomesForList(prisma, baseWhere)

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
      applyForecastSanityFloor,
    } = await import("@/lib/forecast")
    const { getTenantTemplateForecastPhaseData } = await import("@/lib/forecast-template-total")
    const { computePhaseBasedRemainingWorkingDays } = await import("@/lib/forecast-phase-remaining")

    let homesForSerialization = homes

    if (phaseFilter) {
      const { deriveOrderedCategories, computeCurrentPhaseForHome } = await import(
        "@/lib/dashboard/phaseDistribution"
      )

      const phaseHomes = homes.map((h) => ({
        id: h.id,
        addressOrLot: h.addressOrLot,
        startDate: h.startDate,
        createdAt: h.createdAt,
        isComplete: h.isComplete,
        tasks: h.tasks.map((t) => ({
          id: t.id,
          status: t.status,
          scheduledDate: t.scheduledDate,
          templateItem: {
            name: t.nameSnapshot,
            optionalCategory: t.templateItem?.optionalCategory ?? null,
            sortOrder: t.templateItem?.sortOrder ?? 0,
            sequenceOrder: t.templateItem?.sequenceOrder ?? null,
          },
        })),
      }))

      const orderedCategories = deriveOrderedCategories(phaseHomes)
      const phaseHomesById = new Map(phaseHomes.map((h) => [h.id, h]))

      homesForSerialization = homes.filter((h) => {
        const phaseHome = phaseHomesById.get(h.id)
        if (!phaseHome) return false
        const homePhase = computeCurrentPhaseForHome(phaseHome, orderedCategories)
        return homePhase.key === phaseFilter
      })
    }

    let phaseData: Awaited<ReturnType<typeof getTenantTemplateForecastPhaseData>> = null
    if (ctx.companyId != null) {
      const { deriveOrderedCategories } = await import("@/lib/dashboard/phaseDistribution")
      const nameSet = new Set<string>()
      for (const h of homesForSerialization) {
        const ph = {
          id: h.id,
          addressOrLot: h.addressOrLot,
          startDate: h.startDate,
          createdAt: h.createdAt,
          isComplete: h.isComplete,
          tasks: h.tasks.map((t) => ({
            id: t.id,
            status: t.status,
            scheduledDate: t.scheduledDate,
            templateItem: {
              name: t.templateItem?.name ?? t.nameSnapshot,
              optionalCategory: t.templateItem?.optionalCategory ?? null,
              sortOrder: t.templateItem?.sortOrder ?? 0,
              sequenceOrder: t.templateItem?.sequenceOrder ?? null,
            },
          })),
        }
        for (const c of deriveOrderedCategories([ph])) {
          nameSet.add(c.name)
        }
      }
      phaseData = await getTenantTemplateForecastPhaseData(prisma, ctx.companyId, [...nameSet])
    }

    const { createSupabaseServerClient } = await import("@/lib/supabase/server")
    const { signHomeCardThumbnailUrls } = await import("@/lib/home-card-thumbnail")
    const supabase = createSupabaseServerClient()
    const cardThumbnailUrls = await signHomeCardThumbnailUrls(supabase, homesForSerialization)

    const serialized = homesForSerialization.map((h) => {
      const {
        planStoragePath: _p,
        thumbnailStoragePath: _t,
        cardThumbnailStoragePath: _c,
        _count,
        ...rest
      } = h
      let forecastCompletionDate = rest.forecastCompletionDate
      let forecastTotalWorkingDays = rest.forecastTotalWorkingDays
      let criticalPathTaskIds: string[] = []
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
          const cpm = computeHomeForecast(taskNodes, homeStart)
          const remainingWd =
            phaseData != null
              ? computePhaseBasedRemainingWorkingDays(
                  {
                    id: h.id,
                    addressOrLot: h.addressOrLot,
                    startDate: h.startDate,
                    createdAt: h.createdAt,
                    isComplete: h.isComplete,
                    tasks: h.tasks.map((t) => ({
                      id: t.id,
                      status: t.status,
                      scheduledDate: t.scheduledDate,
                      durationDaysSnapshot: t.durationDaysSnapshot,
                      templateItem: {
                        name: t.templateItem?.name ?? t.nameSnapshot,
                        optionalCategory: t.templateItem?.optionalCategory ?? null,
                        sortOrder: t.templateItem?.sortOrder ?? 0,
                        sequenceOrder: t.templateItem?.sequenceOrder ?? null,
                      },
                    })),
                  },
                  phaseData
                )
              : null
          const result = applyForecastSanityFloor(cpm, {
            homeStart,
            taskNodes,
            remainingWorkingDays: remainingWd,
            debugLabel: `list:${h.id}`,
          })
          forecastCompletionDate = result.forecastDate
          forecastTotalWorkingDays =
            result.forecastDate > homeStart
              ? workingDaysBetween(homeStart, result.forecastDate)
              : 0
          criticalPathTaskIds = result.criticalPathTaskIds ?? []
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
        criticalPathTaskIds,
        hasPlan: !!h.planStoragePath || (_count?.homePlans ?? 0) > 0,
        hasThumbnail: !!h.cardThumbnailStoragePath,
        thumbnailUrl: cardThumbnailUrls.get(h.id) ?? null,
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

    const orderAgg = await prisma.home.aggregate({
      where: { subdivisionId: data.subdivisionId },
      _max: { displayOrder: true },
    })

    const home = await prisma.home.create({
      data: {
        companyId: ctx.companyId,
        subdivisionId: data.subdivisionId,
        addressOrLot: data.addressOrLot,
        displayOrder: nextDisplayOrder(orderAgg._max.displayOrder),
        startDate: data.startDate ? new Date(data.startDate) : null,
        targetCompletionDate: data.targetCompletionDate ? new Date(data.targetCompletionDate) : null,
      },
      include: {
        subdivision: true,
      },
    })

    await createAuditLog(ctx.userId, "Home", home.id, "CREATE", null, home, ctx.companyId)

    // Generate tasks from template (tenant-scoped)
    const { workTemplatePrismaOrderBy } = await import("@/lib/work-template-display-order")
    const templateItems = await prisma.workTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [...workTemplatePrismaOrderBy()],
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
