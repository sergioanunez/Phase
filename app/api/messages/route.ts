import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

// GET /api/messages - Fetch message log with role-based filtering
export async function GET(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")

    // Subcontractors cannot access message log
    if (ctx.role === "Subcontractor") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const typeFilter = searchParams.get("type") // scheduled, cancelled, punchlist, confirmation
    const statusFilter = searchParams.get("status") // Sent, Delivered, Failed
    const homeId = searchParams.get("homeId")
    const search = searchParams.get("search")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100)
    const offset = parseInt(searchParams.get("offset") || "0", 10)
    const todayOnly = searchParams.get("today") === "true"

    // Build where clause
    const where: any = {
      companyId: ctx.companyId,
      direction: "Outbound", // Only show outbound messages in log
    }

    // Superintendent: filter by homes assigned to them
    if (ctx.role === "Superintendent") {
      const assignments = await prisma.homeAssignment.findMany({
        where: { companyId: ctx.companyId, superintendentUserId: ctx.userId },
        select: { homeId: true },
      })
      const assignedHomeIds = assignments.map((a) => a.homeId)
      if (assignedHomeIds.length === 0) {
        return NextResponse.json({ messages: [], total: 0 })
      }
      // Messages either have homeId in assigned list, or we need to join via homeTask
      where.OR = [
        { homeId: { in: assignedHomeIds } },
        { homeTask: { homeId: { in: assignedHomeIds } } },
      ]
    }

    if (typeFilter && typeFilter !== "all") {
      where.messageType = typeFilter
    }

    if (statusFilter && statusFilter !== "all") {
      where.status = statusFilter
    }

    if (homeId) {
      where.homeId = homeId
    }

    if (todayOnly) {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      where.createdAt = { gte: startOfDay }
    }

    if (search) {
      where.OR = [
        ...(where.OR || []),
        { body: { contains: search, mode: "insensitive" } },
        { to: { contains: search, mode: "insensitive" } },
        { recipientName: { contains: search, mode: "insensitive" } },
      ]
    }

    const [messages, total] = await Promise.all([
      prisma.smsMessage.findMany({
        where,
        include: {
          home: {
            select: {
              id: true,
              addressOrLot: true,
              subdivision: { select: { name: true } },
            },
          },
          homeTask: {
            select: {
              id: true,
              nameSnapshot: true,
              homeId: true,
              home: {
                select: {
                  id: true,
                  addressOrLot: true,
                  subdivision: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.smsMessage.count({ where }),
    ])

    // Transform messages to include resolved home info
    const transformedMessages = messages.map((msg) => {
      const resolvedHome = msg.home || msg.homeTask?.home || null
      return {
        id: msg.id,
        direction: msg.direction,
        to: msg.to,
        from: msg.from,
        body: msg.body,
        status: msg.status,
        messageType: msg.messageType,
        recipientName: msg.recipientName,
        homeId: resolvedHome?.id ?? null,
        homeAddress: resolvedHome?.addressOrLot ?? null,
        subdivision: resolvedHome?.subdivision?.name ?? null,
        taskId: msg.homeTaskId,
        taskName: msg.homeTask?.nameSnapshot ?? null,
        createdAt: msg.createdAt.toISOString(),
      }
    })

    return NextResponse.json({
      messages: transformedMessages,
      total,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error("Error fetching messages:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch messages" },
      { status: 500 }
    )
  }
}
