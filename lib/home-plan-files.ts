import { PlanFileType } from "@prisma/client"

export const MAX_PLAN_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
export const ALLOWED_PLAN_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export const ALLOWED_PLAN_PDF = "application/pdf"

export function getPlanFileExtension(filename: string, mimeType: string): string {
  const mt = (mimeType || "").toLowerCase().trim()
  if (mt === ALLOWED_PLAN_PDF) return ".pdf"
  if (mt === "image/png") return ".png"
  if (mt === "image/jpeg" || mt === "image/jpg") return ".jpg"
  if (mt === "image/webp") return ".webp"
  const fromFile = filename.split(".").pop()?.toLowerCase()?.trim()
  if (fromFile === "pdf") return ".pdf"
  if (fromFile === "png") return ".png"
  if (fromFile === "jpg" || fromFile === "jpeg") return ".jpg"
  if (fromFile === "webp") return ".webp"
  return ".jpg"
}

export function validatePlanFile(file: File): { ok: true; planFileType: PlanFileType } | { ok: false; error: string } {
  if (!file?.size) return { ok: false, error: "No file provided" }
  if (file.size > MAX_PLAN_FILE_SIZE) {
    return { ok: false, error: "File exceeds 20 MB limit" }
  }
  const mimeType = file.type?.toLowerCase() || ""
  const isPdf = mimeType === ALLOWED_PLAN_PDF
  const isImage = (ALLOWED_PLAN_IMAGE_TYPES as readonly string[]).includes(mimeType)
  if (!isPdf && !isImage) {
    return { ok: false, error: "Invalid file type. Use PDF or image (PNG, JPEG, WebP)." }
  }
  return { ok: true, planFileType: isPdf ? "PDF" : "IMAGE" }
}

export function normalizePlanFileName(file: File, ext: string): string {
  const e = ext.replace(".", "\\.")
  const stripped = file.name?.replace(new RegExp(`${e}$`, "i"), "").trim()
  return stripped || file.name || "plan"
}
