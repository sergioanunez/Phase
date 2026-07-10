import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import { prepareHomePlanUploads } from "@/lib/admin-home-plan-upload"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

function requireAdmin(session: { user?: { id: string; role?: string } } | null) {
  if (!session?.user) {
    return { error: "Unauthorized", status: 401 as const }
  }
  if (session.user.role !== "Admin") {
    return { error: "Forbidden: Settings access required", status: 403 as const }
  }
  return null
}

const bodySchema = z.object({
  planTag: z.string().optional(),
  files: z
    .array(
      z.object({
        name: z.string(),
        size: z.number().int().positive(),
        mimeType: z.string(),
      })
    )
    .min(1),
})

/**
 * POST /api/admin/homes/:homeId/plan/prepare
 * Returns signed Supabase upload targets so large files bypass the serverless body limit.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { homeId: string } | Promise<{ homeId: string }> }
) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")

    const resolved = await Promise.resolve(params)
    const homeId = resolved?.homeId
    if (!homeId) {
      return NextResponse.json({ error: "Home ID is required" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    const authError = requireAdmin(session)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

    const home = await prisma.home.findUnique({ where: { id: homeId } })
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const body = bodySchema.parse(await request.json())
    const planTag = (body.planTag || "Floor Plan").trim()

    const prepared = await prepareHomePlanUploads({
      prisma,
      homeId,
      files: body.files,
      planTag,
    })

    return NextResponse.json(prepared)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid upload request" }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : "Failed to prepare upload"
    console.error("[plan/prepare]", error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
