import type { SupabaseClient } from "@supabase/supabase-js"
import { HOME_PLANS_BUCKET } from "@/lib/supabase/buckets"

export type SignedPlanUploadTarget = {
  storagePath: string
  path: string
  token: string
  /** Full URL for browser PUT upload (no public Supabase env required on client). */
  uploadUrl: string
  upsert: boolean
}

function buildSignedPlanUploadUrl(supabaseUrl: string, storagePath: string, token: string): string {
  const base = supabaseUrl.replace(/\/$/, "")
  const finalPath = `${HOME_PLANS_BUCKET}/${storagePath.replace(/^\/+/, "")}`
  const url = new URL(`${base}/storage/v1/object/upload/sign/${finalPath}`)
  url.searchParams.set("token", token)
  return url.toString()
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

  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error("Missing Supabase env: SUPABASE_URL is required on the server.")
  }

  return {
    storagePath,
    path: data.path,
    token: data.token,
    uploadUrl: buildSignedPlanUploadUrl(supabaseUrl, storagePath, data.token),
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
