import type { PlanFileType } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import {
  getPlanFileExtension,
  MAX_PLAN_FILE_SIZE,
  normalizePlanFileName,
  validatePlanFile,
} from "@/lib/home-plan-files"
import { nextHomePlanStoragePath, parsePlanTag } from "@/lib/home-plans"
import { createSupabaseServerClient, HOME_PLANS_BUCKET } from "@/lib/supabase/server"

type HomeForPlan = {
  id: string
  companyId: string | null
  planStoragePath: string | null
  planFileName: string | null
  planFileType: PlanFileType | null
  planName: string | null
  planVariant: string | null
  planUploadedAt: Date | null
  planUploadedByUserId: string | null
}

/**
 * If the home still has legacy storage and no HomePlan rows, insert a mirror row
 * so new uploads don't strand the old file.
 */
export async function migrateLegacyPlanRowIfNeeded(
  prisma: PrismaClient,
  home: HomeForPlan,
  fallbackUserId: string
): Promise<void> {
  if (!home.planStoragePath) return
  const n = await prisma.homePlan.count({ where: { homeId: home.id } })
  if (n > 0) return
  await prisma.homePlan.create({
    data: {
      homeId: home.id,
      companyId: home.companyId,
      storagePath: home.planStoragePath,
      fileName: home.planFileName ?? "Plan",
      tag: "Floor Plan",
      planFileType: home.planFileType ?? "PDF",
      uploadedByUserId: home.planUploadedByUserId ?? fallbackUserId,
    },
  })
}

export type LegacyPlanUploadResult = {
  kind: "legacy"
  planName: string | null
  planFileName: string | null
  planVariant: string | null
  planFileType: PlanFileType
  planUploadedAt: Date
  uploadedBy: { id: string; name: string | null } | null
}

export type MultiPlanUploadResult = {
  kind: "multi"
  created: Array<{ id: string; fileName: string; tag: string; storagePath: string }>
}

/**
 * True when a single Floor Plan upload should use the legacy home.planStoragePath slot only.
 */
export function shouldUseLegacySingleUpload(tag: string, fileCount: number, existingHomePlanCount: number): boolean {
  return fileCount === 1 && existingHomePlanCount === 0 && parsePlanTag(tag) === "Floor Plan"
}

export async function uploadLegacySinglePlan(params: {
  prisma: PrismaClient
  home: HomeForPlan
  homeId: string
  file: File
  planNameFromForm: string | null
  planVariant: string | null
  userId: string
}): Promise<LegacyPlanUploadResult> {
  const { prisma, home, homeId, file, planNameFromForm, planVariant, userId } = params
  const valid = validatePlanFile(file)
  if (!valid.ok) throw new Error(valid.error)

  const mimeType = file.type?.toLowerCase() || ""
  let ext = getPlanFileExtension(file.name, mimeType)
  if (![".pdf", ".png", ".jpg", ".jpeg", ".webp"].includes(ext)) ext = ".jpg"
  const planName =
    planNameFromForm != null && planNameFromForm !== "" ? planNameFromForm : home.planName
  const planFileName = normalizePlanFileName(file, ext)
  const storagePath = `homes/${homeId}/floorplan${ext}`
  const planFileType = valid.planFileType

  const supabase = createSupabaseServerClient()
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabase.storage
    .from(HOME_PLANS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    })
  if (uploadError) throw new Error(uploadError.message || "Failed to upload plan")

  try {
    const { persistHomeCardThumbnail } = await import("@/lib/home-card-thumbnail")
    await persistHomeCardThumbnail({
      supabase,
      prisma,
      homeId,
      sourceBuffer: buffer,
      mimeType,
    })
  } catch (thumbError) {
    console.error("Failed to generate card thumbnail from plan upload:", thumbError)
  }

  const updated = await prisma.home.update({
    where: { id: homeId },
    data: {
      planStoragePath: storagePath,
      planFileName,
      planFileType,
      planName,
      planVariant: planVariant ?? home.planVariant,
      planUploadedAt: new Date(),
      planUploadedByUserId: userId,
    },
    include: {
      planUploadedBy: { select: { id: true, name: true } },
    },
  })

  return {
    kind: "legacy",
    planName: updated.planName,
    planFileName: updated.planFileName,
    planVariant: updated.planVariant,
    planFileType: updated.planFileType!,
    planUploadedAt: updated.planUploadedAt!,
    uploadedBy: updated.planUploadedBy,
  }
}

export async function uploadMultiHomePlans(params: {
  prisma: PrismaClient
  home: HomeForPlan
  homeId: string
  files: File[]
  tag: string
  userId: string
}): Promise<MultiPlanUploadResult> {
  const { prisma, home, homeId, files, tag, userId } = params
  const normalizedTag = parsePlanTag(tag)

  await migrateLegacyPlanRowIfNeeded(prisma, home, userId)

  const supabase = createSupabaseServerClient()
  const created: MultiPlanUploadResult["created"] = []

  for (const [index, file] of files.entries()) {
    const valid = validatePlanFile(file)
    if (!valid.ok) throw new Error(valid.error)
    if (file.size > MAX_PLAN_FILE_SIZE) throw new Error("File exceeds 20 MB limit")

    const mimeType = file.type?.toLowerCase() || ""
    let ext = getPlanFileExtension(file.name, mimeType)
    if (![".pdf", ".png", ".jpg", ".jpeg", ".webp"].includes(ext)) ext = ".jpg"
    const fileName = normalizePlanFileName(file, ext)
    const { storagePath } = nextHomePlanStoragePath(homeId, ext)
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(HOME_PLANS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      })
    if (uploadError) throw new Error(uploadError.message || "Failed to upload plan")

    if (index === 0) {
      try {
        const { persistHomeCardThumbnail } = await import("@/lib/home-card-thumbnail")
        await persistHomeCardThumbnail({
          supabase,
          prisma,
          homeId,
          sourceBuffer: buffer,
          mimeType,
        })
      } catch (thumbError) {
        console.error("Failed to generate card thumbnail from multi-plan upload:", thumbError)
      }
    }

    const row = await prisma.homePlan.create({
      data: {
        homeId,
        companyId: home.companyId,
        storagePath,
        fileName,
        tag: normalizedTag,
        planFileType: valid.planFileType,
        uploadedByUserId: userId,
      },
    })
    created.push({ id: row.id, fileName, tag: normalizedTag, storagePath })
  }

  return { kind: "multi", created }
}
