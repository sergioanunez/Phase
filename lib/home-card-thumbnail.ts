import type { PrismaClient } from "@prisma/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { HOME_PLANS_BUCKET } from "@/lib/supabase/server"

/** Target width for Homes list card thumbnails (160–240px range). */
export const CARD_THUMBNAIL_MAX_WIDTH = 200

export const CARD_THUMBNAIL_STORAGE_PATH = (homeId: string) =>
  `homes/${homeId}/card-thumbnail.jpg`

const JPEG_QUALITY = 72

async function resizeImageBuffer(input: Buffer): Promise<Buffer> {
  const { Jimp } = await import("jimp")
  const image = await Jimp.fromBuffer(input)

  if (image.width > CARD_THUMBNAIL_MAX_WIDTH || image.height > CARD_THUMBNAIL_MAX_WIDTH) {
    image.scaleToFit({ w: CARD_THUMBNAIL_MAX_WIDTH, h: CARD_THUMBNAIL_MAX_WIDTH })
  }

  return image.getBuffer("image/jpeg", { quality: JPEG_QUALITY })
}

export async function buildCardThumbnailFromImage(input: Buffer): Promise<Buffer> {
  return resizeImageBuffer(input)
}

export async function buildCardThumbnailFromPdf(_pdfBuffer: Buffer): Promise<Buffer | null> {
  // PDF preview needs native bindings that break Vercel builds; use image uploads for card previews.
  return null
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
  const jpeg = await buildCardThumbnailWebp(sourceBuffer, mimeType)
  if (!jpeg) return null

  const storagePath = CARD_THUMBNAIL_STORAGE_PATH(homeId)
  const { error } = await supabase.storage.from(HOME_PLANS_BUCKET).upload(storagePath, jpeg, {
    contentType: "image/jpeg",
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
