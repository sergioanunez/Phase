-- Manual home ordering within subdivisions
ALTER TABLE "Home" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Home_subdivisionId_displayOrder_idx" ON "Home"("subdivisionId", "displayOrder");

WITH ranked AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (PARTITION BY "subdivisionId" ORDER BY "createdAt" ASC, "addressOrLot" ASC)) * 100 AS ord
  FROM "Home"
)
UPDATE "Home" AS h
SET "displayOrder" = r.ord
FROM ranked AS r
WHERE h.id = r.id AND (h."displayOrder" IS NULL OR h."displayOrder" = 0);
