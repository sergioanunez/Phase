import { describe, expect, it } from "vitest"
import {
  CARD_THUMBNAIL_MAX_WIDTH,
  CARD_THUMBNAIL_STORAGE_PATH,
  buildCardThumbnailFromImage,
} from "./home-card-thumbnail"

describe("home card thumbnail paths", () => {
  it("uses a fixed webp path per home", () => {
    expect(CARD_THUMBNAIL_STORAGE_PATH("home_123")).toBe("homes/home_123/card-thumbnail.webp")
  })

  it("targets card width in the 160–240px range", () => {
    expect(CARD_THUMBNAIL_MAX_WIDTH).toBeGreaterThanOrEqual(160)
    expect(CARD_THUMBNAIL_MAX_WIDTH).toBeLessThanOrEqual(240)
  })
})

describe("buildCardThumbnailFromImage", () => {
  it("produces a small webp under 30KB for a simple png", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSFgGAAfQAj/H4QIOAAAAAElFTkSuQmCC",
      "base64"
    )
    const webp = await buildCardThumbnailFromImage(png)
    expect(webp.length).toBeGreaterThan(0)
    expect(webp.length).toBeLessThan(30 * 1024)
    expect(webp.subarray(0, 4).toString()).toBe("RIFF")
  })
})
