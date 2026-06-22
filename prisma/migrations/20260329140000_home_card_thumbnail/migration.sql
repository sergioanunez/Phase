-- Optimized card thumbnail for Homes list (small WebP, generated at upload time).
ALTER TABLE "Home" ADD COLUMN IF NOT EXISTS "cardThumbnailStoragePath" TEXT;
