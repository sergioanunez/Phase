-- AlterTable: add default contact for SMS (contact = User linked to this vendor)
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "defaultContactId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contractor_defaultContactId_idx" ON "Contractor"("defaultContactId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Contractor_defaultContactId_fkey'
  ) THEN
    ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_defaultContactId_fkey"
      FOREIGN KEY ("defaultContactId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
