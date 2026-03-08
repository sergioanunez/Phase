-- Manual migration: Add ImportBatch and Contractor.importBatchId for bulk contractor import.
-- Run this in Supabase SQL Editor if you are not using Prisma migrate.

-- 1. Create ImportBatch table
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- 2. Indexes on ImportBatch
CREATE INDEX "ImportBatch_companyId_idx" ON "ImportBatch"("companyId");
CREATE INDEX "ImportBatch_createdByUserId_idx" ON "ImportBatch"("createdByUserId");
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");

-- 3. Foreign keys on ImportBatch
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Add importBatchId to Contractor
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "importBatchId" TEXT;

-- 5. Index on Contractor.importBatchId
CREATE INDEX IF NOT EXISTS "Contractor_importBatchId_idx" ON "Contractor"("importBatchId");

-- 6. Foreign key: Contractor.importBatchId -> ImportBatch.id (SET NULL on delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Contractor_importBatchId_fkey'
    ) THEN
        ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_importBatchId_fkey"
            FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
