/** Browser upload to a Supabase signed upload URL (matches SDK FormData behavior). */
export async function putFileToSignedPlanUploadUrl(
  uploadUrl: string,
  file: File,
  upsert: boolean
): Promise<void> {
  const formData = new FormData()
  formData.append("cacheControl", "3600")
  formData.append("", file)

  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: formData,
    headers: {
      "x-upsert": String(upsert),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text.trim() || `Upload failed (${res.status})`)
  }
}
