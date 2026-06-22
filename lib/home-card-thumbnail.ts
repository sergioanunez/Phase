import type { PrismaClient } from "@prisma/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { HOME_PLANS_BUCKET } from "@/lib/supabase/server"

/** Target width for Homes list card thumbnails (160–240px range). */
export const CARD_THUMBNAIL_MAX_WIDTH = 200

export const CARD_THUMBNAIL_STORAGE_PATH = (homeId: string) =>
  `homes/${homeId}/card-thumbnail.webp`

const WEBP_OPTIONS = { quality: 72, effort: 4 } as const

export async function buildCardThumbnailFromImage(input: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default
  return sharp(input)
    .rotate()
    .resize(CARD_THUMBNAIL_MAX_WIDTH, CARD_THUMBNAIL_MAX_WIDTH, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp(WEBP_OPTIONS)
    .toBuffer()
}

export async function buildCardThumbnailFromPdf(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const { pdf } = await import("pdf-to-img")
    const document = await pdf(pdfBuffer, { scale: 1.5 })
    for await (const page of document) {
      return buildCardThumbnailFromImage(page)
    }
    return null
  } catch (error) {
    console.error("PDF card thumbnail generation failed:", error)
    return null
  }
}

export async function buildCardThumbnailWebp(
  source: Buffer,
  mimeType: string
): Promise<Buffer | null> {
  const mt = (mimeType || "").toLowerCase().trim()
  if (mt === "application/pdf") {
    return buildCardThumbnailFromPdf(source)
  }
  if (mt.startsWith("image/")) {
    return buildCardThumbnailFromImage(source)
  }
  return null
}

export async function persistHomeCardThumbnail(params: {
  supabase: SupabaseClient
  prisma: PrismaClient
  homeId: string
  sourceBuffer: Buffer
  mimeType: string
}): Promise<string | null> {
  const { supabase, prisma, homeId, sourceBuffer, mimeType } = params
  const webp = await buildCardThumbnailWebp(sourceBuffer, mimeType)
  if (!webp) return null

  const storagePath = CARD_THUMBNAIL_STORAGE_PATH(homeId)
  const { error } = await supabase.storage.from(HOME_PLANS_BUCKET).upload(storagePath, webp, {
    contentType: "image/webp",
    upsert: true,
  })
  if (error) {
    throw new Error(error.message || "Failed to upload card thumbnail")
  }

  await prisma.home.update({
    where: { id: homeId },
    data: { cardThumbnailStoragePath: storagePath },
  })

  return storagePath
}

export async function signHomeCardThumbnailUrls(
  supabase: SupabaseClient,
  homes: Array<{ id: string; cardThumbnailStoragePath: string | null }>,
  expiresInSeconds = 60 * 60
): Promise<Map<string, string>> {
  const entries = homes
    .filter((h): h is { id: string; cardThumbnailStoragePath: string } => !!h.cardThumbnailStoragePath)
    .map((h) => ({ id: h.id, path: h.cardThumbnailStoragePath }))

  const signedByHomeId = new Map<string, string>()
  if (entries.length === 0) return signedByHomeId

  const { data, error } = await supabase.storage
    .from(HOME_PLANS_BUCKET)
    .createSignedUrls(
      entries.map((e) => e.path),
      expiresInSeconds
    )

  if (error || !data) {
    console.error("Batch card thumbnail signed URL error:", error)
    return signedByHomeId
  }

  data.forEach((item, index) => {
    if (item.signedUrl) {
      signedByHomeId.set(entries[index]!.id, item.signedUrl)
    }
  })

  return signedByHomeId
}
