import { readFile } from "fs/promises"
import { join } from "path"
import { describe, expect, it } from "vitest"
import {
  CARD_THUMBNAIL_MAX_WIDTH,
  CARD_THUMBNAIL_STORAGE_PATH,
  buildCardThumbnailFromImage,
} from "./home-card-thumbnail"

describe("home card thumbnail paths", () => {
  it("uses a fixed jpeg path per home", () => {
    expect(CARD_THUMBNAIL_STORAGE_PATH("home_123")).toBe("homes/home_123/card-thumbnail.jpg")
  })

  it("targets card width in the 160–240px range", () => {
    expect(CARD_THUMBNAIL_MAX_WIDTH).toBeGreaterThanOrEqual(160)
    expect(CARD_THUMBNAIL_MAX_WIDTH).toBeLessThanOrEqual(240)
  })
})

describe("buildCardThumbnailFromImage", () => {
  it("produces a small jpeg under 30KB for a real png", async () => {
    const png = await readFile(join(process.cwd(), "public/favicon.png"))
    const jpeg = await buildCardThumbnailFromImage(png)
    expect(jpeg.length).toBeGreaterThan(0)
    expect(jpeg.length).toBeLessThan(30 * 1024)
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)
  })
})
