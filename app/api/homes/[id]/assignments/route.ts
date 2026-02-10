import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-response"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

const putSchema = z.object({
  superintendentUserIds: z.array(z.string()),
})

/**
 * GET /api/homes/[id]/assignments
 * Returns superintendents assigned to this home. Admin only (homes:read).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (isBuild()) return NextResponse.json([], { status: 200 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:read")
    const { id: homeId } = await params

    const home = await prisma.home.findFirst({
      where: { id: homeId, companyId: ctx.companyId },
    })
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const assignments = await prisma.homeAssignment.findMany({
      where: { homeId, companyId: ctx.companyId },
      include: {
        superintendent: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(
      assignments.map((a) => ({
        superintendentUserId: a.superintendentUserId,
        superintendent: a.superintendent,
      }))
    )
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PUT /api/homes/[id]/assignments
 * Set superintendent assignments for this home (replaces existing). Admin only (homes:write).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const ctx = await requireTenantPermission("homes:write")
    const { id: homeId } = await params

    const home = await prisma.home.findFirst({
      where: { id: homeId, companyId: ctx.companyId },
    })
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const body = await request.json()
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().formErrors?.[0] ?? "Invalid input" },
        { status: 400 }
      )
    }

    const { superintendentUserIds } = parsed.data

    // Ensure all user IDs are superintendents in this company
    const users = await prisma.user.findMany({
      where: {
        id: { in: superintendentUserIds },
        companyId: ctx.companyId,
        role: "Superintendent",
      },
      select: { id: true },
    })
    const validIds = users.map((u) => u.id)
    const invalidIds = superintendentUserIds.filter((id) => !validIds.includes(id))
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "Some users are not superintendents in this company" },
        { status: 400 }
      )
    }

    await prisma.$transaction([
      prisma.homeAssignment.deleteMany({
        where: { homeId, companyId: ctx.companyId },
      }),
      ...validIds.map((superintendentUserId) =>
        prisma.homeAssignment.create({
          data: {
            companyId: ctx.companyId,
            homeId,
            superintendentUserId,
          },
        })
      ),
    ])

    const assignments = await prisma.homeAssignment.findMany({
      where: { homeId, companyId: ctx.companyId },
      include: {
        superintendent: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(
      assignments.map((a) => ({
        superintendentUserId: a.superintendentUserId,
        superintendent: a.superintendent,
      }))
    )
  } catch (error) {
    return handleApiError(error)
  }
}
