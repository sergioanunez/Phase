import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-response"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { requireTenantContext } from "@/lib/tenant"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
})

const BUILDERS = ["Admin", "Manager", "Superintendent"] as const

export async function GET() {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()
    if (!BUILDERS.includes(ctx.role as (typeof BUILDERS)[number])) {
      return NextResponse.json({ error: "Push is available only for builder roles." }, { status: 403 })
    }
    const { prisma } = await import("@/lib/prisma")
    const subs = await prisma.webPushSubscription.findMany({
      where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
      select: { id: true, endpoint: true, createdAt: true, userAgent: true },
      orderBy: { updatedAt: "desc" },
    })
    return NextResponse.json({ subscriptions: subs })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()
    if (!BUILDERS.includes(ctx.role as (typeof BUILDERS)[number])) {
      return NextResponse.json({ error: "Push is available only for builder roles." }, { status: 403 })
    }
    const body = await request.json()
    const data = subscribeSchema.parse(body)
    const { prisma } = await import("@/lib/prisma")

    const existing = await prisma.webPushSubscription.findUnique({
      where: { endpoint: data.endpoint },
    })
    if (existing && (existing.userId !== ctx.userId || existing.companyId !== ctx.companyId)) {
      return NextResponse.json(
        { error: "This browser subscription is registered to another account." },
        { status: 409 }
      )
    }

    const row = await prisma.webPushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: {
        userId: ctx.userId,
        companyId: ctx.companyId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: data.userAgent ?? null,
        isActive: true,
      },
      update: {
        userId: ctx.userId,
        companyId: ctx.companyId,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: data.userAgent ?? null,
        isActive: true,
      },
    })

    return NextResponse.json({ ok: true, id: row.id })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? "Invalid body" }, { status: 400 })
    }
    return handleApiError(e)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const ctx = await requireTenantContext()
    if (!BUILDERS.includes(ctx.role as (typeof BUILDERS)[number])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const endpoint = searchParams.get("endpoint")
    const { prisma } = await import("@/lib/prisma")

    if (endpoint) {
      const sub = await prisma.webPushSubscription.findFirst({
        where: { endpoint, userId: ctx.userId, companyId: ctx.companyId },
      })
      if (sub) {
        await prisma.webPushSubscription.update({
          where: { id: sub.id },
          data: { isActive: false },
        })
      }
    } else {
      await prisma.webPushSubscription.updateMany({
        where: { userId: ctx.userId, companyId: ctx.companyId },
        data: { isActive: false },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
