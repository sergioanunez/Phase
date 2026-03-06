import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

// GET /api/homes/[id]/activity - Fetch activity timeline for a home
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { getAssignedHomeIdsForContractor } = await import("@/lib/tenant")
    const ctx = await requireTenantPermission("homes:read")

    const homeId = params.id
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100)
    const all = searchParams.get("all") === "true"

    // Verify home belongs to tenant and user has access
    const home = await prisma.home.findFirst({
      where: { id: homeId, companyId: ctx.companyId },
      select: { id: true, companyId: true },
    })

    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    // Superintendent: check assignment
    if (ctx.role === "Superintendent") {
      const assignment = await prisma.homeAssignment.findFirst({
        where: {
          companyId: ctx.companyId,
          homeId,
          superintendentUserId: ctx.userId,
        },
      })
      if (!assignment) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
    }

    // Subcontractor: check contractor assignment
    if (ctx.role === "Subcontractor" && ctx.contractorId) {
      const assignedHomeIds = await getAssignedHomeIdsForContractor(ctx.companyId, ctx.contractorId)
      if (!assignedHomeIds.includes(homeId)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
      // Subcontractors don't see builder timeline
      return NextResponse.json({ events: [], total: 0 })
    }

    // Fetch activity events
    const [activityEvents, smsMessages, total] = await Promise.all([
      prisma.activityEvent.findMany({
        where: { homeId },
        orderBy: { createdAt: "desc" },
        take: all ? 100 : limit,
      }),
      // Also fetch SMS messages for this home (derived timeline)
      prisma.smsMessage.findMany({
        where: {
          companyId: ctx.companyId,
          direction: "Outbound",
          OR: [
            { homeId },
            { homeTask: { homeId } },
          ],
        },
        include: {
          homeTask: { select: { nameSnapshot: true } },
        },
        orderBy: { createdAt: "desc" },
        take: all ? 100 : limit,
      }),
      prisma.activityEvent.count({ where: { homeId } }),
    ])

    // Convert SMS messages to timeline events
    const smsEvents = smsMessages.map((msg) => ({
      id: `sms-${msg.id}`,
      source: "sms" as const,
      eventType: msg.messageType === "punchlist" ? "punchlist_sent" : "sms_sent",
      title: msg.messageType === "scheduled"
        ? `Scheduled SMS sent${msg.homeTask?.nameSnapshot ? ` for ${msg.homeTask.nameSnapshot}` : ""}`
        : msg.messageType === "cancelled"
          ? `Cancelled SMS sent${msg.homeTask?.nameSnapshot ? ` for ${msg.homeTask.nameSnapshot}` : ""}`
          : msg.messageType === "punchlist"
            ? "Punchlist SMS sent"
            : "SMS sent",
      description: null,
      actorName: null,
      recipientName: msg.recipientName,
      createdAt: msg.createdAt.toISOString(),
      metadata: { messageType: msg.messageType, status: msg.status },
    }))

    // Convert activity events to timeline format
    const activityEventsFormatted = activityEvents.map((evt) => ({
      id: evt.id,
      source: "activity" as const,
      eventType: evt.eventType,
      title: evt.title,
      description: evt.description,
      actorName: evt.actorName,
      recipientName: evt.recipientName,
      createdAt: evt.createdAt.toISOString(),
      metadata: evt.metadataJson,
    }))

    // Merge and deduplicate (SMS events might already be in activity events)
    const allEvents = [...activityEventsFormatted, ...smsEvents]
    const seenIds = new Set<string>()
    const uniqueEvents = allEvents.filter((evt) => {
      // Dedupe by preferring activity events over SMS-derived events
      if (evt.source === "sms") {
        const hasDuplicate = activityEventsFormatted.some(
          (ae) =>
            ae.eventType === evt.eventType &&
            Math.abs(new Date(ae.createdAt).getTime() - new Date(evt.createdAt).getTime()) < 60000
        )
        if (hasDuplicate) return false
      }
      if (seenIds.has(evt.id)) return false
      seenIds.add(evt.id)
      return true
    })

    // Sort by date desc
    uniqueEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Limit if not requesting all
    const finalEvents = all ? uniqueEvents : uniqueEvents.slice(0, limit)

    return NextResponse.json({
      events: finalEvents,
      total: total + smsMessages.length,
      hasMore: uniqueEvents.length > limit,
    })
  } catch (error: any) {
    console.error("Error fetching home activity:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch activity" },
      { status: 500 }
    )
  }
}
