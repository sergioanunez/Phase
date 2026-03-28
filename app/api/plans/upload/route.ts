import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import {
  shouldUseLegacySingleUpload,
  uploadLegacySinglePlan,
  uploadMultiHomePlans,
} from "@/lib/admin-home-plan-upload"
import { createAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

function collectFiles(formData: FormData): File[] {
  return formData
    .getAll("file")
    .filter((x): x is File => typeof File !== "undefined" && x instanceof File && x.size > 0)
}

/**
 * POST /api/plans/upload
 * Multipart: houseId (required), file (repeatable), planTag (optional), planName, planVariant
 * Admin-only; same behavior as POST /api/admin/homes/:houseId/plan
 */
export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const { prisma } = await import("@/lib/prisma")

    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== "Admin") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 })
    }

    const formData = await request.formData()
    const houseId = (formData.get("houseId") as string)?.trim()
    if (!houseId) {
      return NextResponse.json({ error: "houseId is required" }, { status: 400 })
    }

    const files = collectFiles(formData)
    if (files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const home = await prisma.home.findUnique({
      where: { id: houseId },
      include: { subdivision: true },
    })
    if (!home) {
      return NextResponse.json({ error: "Home not found" }, { status: 404 })
    }

    const planTagRaw = ((formData.get("planTag") as string) || "Floor Plan").trim()
    const planNameFromForm = (formData.get("planName") as string)?.trim() || null
    const planVariant = (formData.get("planVariant") as string) || null
    const existingHomePlanCount = await prisma.homePlan.count({ where: { homeId: houseId } })
    const useLegacy = shouldUseLegacySingleUpload(planTagRaw, files.length, existingHomePlanCount)
    const userId = session.user.id

    if (useLegacy) {
      const before = {
        planStoragePath: home.planStoragePath,
        planFileName: home.planFileName,
        planFileType: home.planFileType,
        planName: home.planName,
        planVariant: home.planVariant,
        planUploadedAt: home.planUploadedAt,
        planUploadedByUserId: home.planUploadedByUserId,
      }

      const result = await uploadLegacySinglePlan({
        prisma,
        home,
        homeId: houseId,
        file: files[0]!,
        planNameFromForm,
        planVariant,
        userId,
      })

      const updated = await prisma.home.findUnique({
        where: { id: houseId },
        include: { planUploadedBy: { select: { id: true, name: true } } },
      })

      await createAuditLog(userId, "Home", houseId, "HOME_PLAN_UPLOADED", before, {
        planStoragePath: updated?.planStoragePath,
        planFileName: updated?.planFileName,
        planFileType: updated?.planFileType,
        planName: updated?.planName,
        planVariant: updated?.planVariant,
        planUploadedAt: updated?.planUploadedAt,
        planUploadedByUserId: updated?.planUploadedByUserId,
      })

      return NextResponse.json({
        mode: "legacy",
        planName: result.planName,
        planFileName: result.planFileName,
        planVariant: result.planVariant,
        planFileType: result.planFileType,
        planUploadedAt: result.planUploadedAt,
        uploadedBy: result.uploadedBy,
      })
    }

    const beforeMulti = { homePlanCount: existingHomePlanCount }
    const multi = await uploadMultiHomePlans({
      prisma,
      home,
      homeId: houseId,
      files,
      tag: planTagRaw,
      userId,
    })

    await createAuditLog(userId, "Home", houseId, "HOME_PLANS_UPLOADED", beforeMulti, {
      homePlanCount: existingHomePlanCount + multi.created.length,
      created: multi.created,
    })

    return NextResponse.json({ mode: "multi", created: multi.created })
  } catch (error: unknown) {
    console.error("POST /api/plans/upload:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload plan" },
      { status: 500 }
    )
  }
}
