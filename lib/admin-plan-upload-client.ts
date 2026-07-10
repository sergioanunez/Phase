"use client"

import { validatePlanFile } from "@/lib/home-plan-files"
import { putFileToSignedPlanUploadUrl } from "@/lib/plan-signed-upload-client"
import { readApiJson } from "@/lib/read-api-response"

export async function uploadHomePlansFromAdmin(params: {
  homeId: string
  files: File[]
  planTag: string
  planName?: string
  planVariant?: string
}): Promise<void> {
  const { homeId, files, planTag, planName, planVariant } = params
  if (files.length === 0) {
    throw new Error("Please select at least one file (PDF or image: PNG, JPEG, WebP). Max 20 MB each.")
  }

  for (const file of files) {
    const valid = validatePlanFile(file)
    if (!valid.ok) throw new Error(valid.error)
  }

  const prepareRes = await fetch(`/api/admin/homes/${homeId}/plan/prepare`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planTag,
      files: files.map((f) => ({
        name: f.name,
        size: f.size,
        mimeType: f.type,
      })),
    }),
  })

  const prepared = await readApiJson<{
    mode: "legacy" | "multi"
    uploads: Array<{
      storagePath: string
      path: string
      token: string
      uploadUrl: string
      upsert: boolean
      fileName: string
      planFileType: string
      mimeType: string
    }>
  }>(prepareRes)

  if (!prepared.ok || !prepared.data?.uploads?.length) {
    throw new Error(prepared.error || "Failed to prepare plan upload")
  }

  for (let i = 0; i < files.length; i++) {
    const target = prepared.data.uploads[i]
    const file = files[i]
    if (!target || !file) continue

    await putFileToSignedPlanUploadUrl(target.uploadUrl, file, target.upsert)
  }

  const completeRes = await fetch(`/api/admin/homes/${homeId}/plan/complete`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: prepared.data.mode,
      planTag,
      planName: planName?.trim() || null,
      planVariant: planVariant?.trim() || null,
      uploads: prepared.data.uploads.map((u) => ({
        storagePath: u.storagePath,
        fileName: u.fileName,
        planFileType: u.planFileType,
        mimeType: u.mimeType,
      })),
    }),
  })

  const completed = await readApiJson(completeRes)
  if (!completed.ok) {
    throw new Error(completed.error || "Failed to save plan upload")
  }
}
