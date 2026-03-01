-- AlterTable Contractor: add leadDays (default 0)
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "leadDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable WorkTemplateItem: add contractorId, contractorLeadOverrideDays and index
ALTER TABLE "WorkTemplateItem" ADD COLUMN IF NOT EXISTS "contractorId" TEXT;
ALTER TABLE "WorkTemplateItem" ADD COLUMN IF NOT EXISTS "contractorLeadOverrideDays" INTEGER;

CREATE INDEX IF NOT EXISTS "WorkTemplateItem_contractorId_idx" ON "WorkTemplateItem"("contractorId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkTemplateItem_contractorId_fkey'
  ) THEN
    ALTER TABLE "WorkTemplateItem" ADD CONSTRAINT "WorkTemplateItem_contractorId_fkey"
      FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
