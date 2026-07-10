import type { SupabaseClient } from "@supabase/supabase-js"
import { HOME_PLANS_BUCKET } from "@/lib/supabase/buckets"

export type SignedPlanUploadTarget = {
  storagePath: string
  path: string
  token: string
  upsert: boolean
}

export async function createPlanSignedUploadUrl(
  supabase: SupabaseClient,
  storagePath: string,
  upsert: boolean
): Promise<SignedPlanUploadTarget> {
  const { data, error } = await supabase.storage
    .from(HOME_PLANS_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert })

  if (error || !data?.token || !data.path) {
    throw new Error(error?.message || "Failed to prepare file upload")
  }

  return {
    storagePath,
    path: data.path,
    token: data.token,
    upsert,
  }
}

export async function downloadPlanFileFromStorage(
  supabase: SupabaseClient,
  storagePath: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const { data, error } = await supabase.storage.from(HOME_PLANS_BUCKET).download(storagePath)
  if (error || !data) {
    throw new Error(error?.message || "Uploaded file not found in storage")
  }
  const buffer = Buffer.from(await data.arrayBuffer())
  return { buffer, mimeType: data.type || "application/octet-stream" }
}
