import type { PlanFileType } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import {
  getPlanFileExtension,
  MAX_PLAN_FILE_SIZE,
  normalizePlanFileName,
  validatePlanFile,
} from "@/lib/home-plan-files"
import { nextHomePlanStoragePath, parsePlanTag } from "@/lib/home-plans"
import { HOME_PLANS_BUCKET } from "@/lib/supabase/buckets"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  createPlanSignedUploadUrl,
  downloadPlanFileFromStorage,
  type SignedPlanUploadTarget,
} from "@/lib/supabase/signed-upload"

export type PlanUploadFileMeta = {
  name: string
  size: number
  mimeType: string
}

export type PreparedPlanUpload = SignedPlanUploadTarget & {
  fileName: string
  planFileType: PlanFileType
  mimeType: string
}

export type PreparePlanUploadResult = {
  mode: "legacy" | "multi"
  uploads: PreparedPlanUpload[]
}

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

function validatePlanFileMeta(meta: PlanUploadFileMeta): { ok: true; planFileType: PlanFileType; ext: string } | { ok: false; error: string } {
  if (!meta.size) return { ok: false, error: "No file provided" }
  if (meta.size > MAX_PLAN_FILE_SIZE) return { ok: false, error: "File exceeds 20 MB limit" }
  const mimeType = meta.mimeType?.toLowerCase() || ""
  const isPdf = mimeType === "application/pdf"
  const isImage = ["image/png", "image/jpeg", "image/webp"].includes(mimeType)
  if (!isPdf && !isImage) {
    return { ok: false, error: "Invalid file type. Use PDF or image (PNG, JPEG, WebP)." }
  }
  let ext = getPlanFileExtension(meta.name, mimeType)
  if (![".pdf", ".png", ".jpg", ".jpeg", ".webp"].includes(ext)) ext = ".jpg"
  return { ok: true, planFileType: isPdf ? "PDF" : "IMAGE", ext }
}

export async function prepareHomePlanUploads(params: {
  prisma: PrismaClient
  homeId: string
  files: PlanUploadFileMeta[]
  planTag: string
}): Promise<PreparePlanUploadResult> {
  const { prisma, homeId, files, planTag } = params
  if (files.length === 0) throw new Error("No file provided")

  const existingHomePlanCount = await prisma.homePlan.count({ where: { homeId } })
  const useLegacy = shouldUseLegacySingleUpload(planTag, files.length, existingHomePlanCount)
  const supabase = createSupabaseServerClient()
  const uploads: PreparedPlanUpload[] = []

  if (useLegacy) {
    const meta = files[0]!
    const valid = validatePlanFileMeta(meta)
    if (!valid.ok) throw new Error(valid.error)
    const storagePath = `homes/${homeId}/floorplan${valid.ext}`
    const signed = await createPlanSignedUploadUrl(supabase, storagePath, true)
    uploads.push({
      ...signed,
      fileName: normalizePlanFileName({ name: meta.name } as File, valid.ext),
      planFileType: valid.planFileType,
      mimeType: meta.mimeType?.toLowerCase() || "",
    })
    return { mode: "legacy", uploads }
  }

  for (const meta of files) {
    const valid = validatePlanFileMeta(meta)
    if (!valid.ok) throw new Error(valid.error)
    const { storagePath } = nextHomePlanStoragePath(homeId, valid.ext)
    const signed = await createPlanSignedUploadUrl(supabase, storagePath, false)
    uploads.push({
      ...signed,
      fileName: normalizePlanFileName({ name: meta.name } as File, valid.ext),
      planFileType: valid.planFileType,
      mimeType: meta.mimeType?.toLowerCase() || "",
    })
  }

  return { mode: "multi", uploads }
}

export async function finalizeHomePlanUploads(params: {
  prisma: PrismaClient
  home: HomeForPlan
  homeId: string
  userId: string
  mode: "legacy" | "multi"
  planTag: string
  planNameFromForm: string | null
  planVariant: string | null
  uploads: Array<{
    storagePath: string
    fileName: string
    planFileType: PlanFileType
    mimeType: string
  }>
}): Promise<LegacyPlanUploadResult | MultiPlanUploadResult> {
  const {
    prisma,
    home,
    homeId,
    userId,
    mode,
    planTag,
    planNameFromForm,
    planVariant,
    uploads,
  } = params
  if (uploads.length === 0) throw new Error("No uploads to finalize")

  const supabase = createSupabaseServerClient()

  if (mode === "legacy") {
    const upload = uploads[0]!
    const { buffer, mimeType } = await downloadPlanFileFromStorage(supabase, upload.storagePath)

    try {
      const { persistHomeCardThumbnail } = await import("@/lib/home-card-thumbnail")
      await persistHomeCardThumbnail({
        supabase,
        prisma,
        homeId,
        sourceBuffer: buffer,
        mimeType: upload.mimeType || mimeType,
      })
    } catch (thumbError) {
      console.error("Failed to generate card thumbnail from plan upload:", thumbError)
    }

    const planName =
      planNameFromForm != null && planNameFromForm !== "" ? planNameFromForm : home.planName

    const updated = await prisma.home.update({
      where: { id: homeId },
      data: {
        planStoragePath: upload.storagePath,
        planFileName: upload.fileName,
        planFileType: upload.planFileType,
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

  const normalizedTag = parsePlanTag(planTag)
  await migrateLegacyPlanRowIfNeeded(prisma, home, userId)

  const created: MultiPlanUploadResult["created"] = []

  for (const [index, upload] of uploads.entries()) {
    if (index === 0) {
      try {
        const { buffer, mimeType } = await downloadPlanFileFromStorage(supabase, upload.storagePath)
        const { persistHomeCardThumbnail } = await import("@/lib/home-card-thumbnail")
        await persistHomeCardThumbnail({
          supabase,
          prisma,
          homeId,
          sourceBuffer: buffer,
          mimeType: upload.mimeType || mimeType,
        })
      } catch (thumbError) {
        console.error("Failed to generate card thumbnail from multi-plan upload:", thumbError)
      }
    }

    const row = await prisma.homePlan.create({
      data: {
        homeId,
        companyId: home.companyId,
        storagePath: upload.storagePath,
        fileName: upload.fileName,
        tag: normalizedTag,
        planFileType: upload.planFileType,
        uploadedByUserId: userId,
      },
    })
    created.push({
      id: row.id,
      fileName: upload.fileName,
      tag: normalizedTag,
      storagePath: upload.storagePath,
    })
  }

  return { kind: "multi", created }
}
