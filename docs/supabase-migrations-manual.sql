-- =============================================================================
-- Run these in Supabase Dashboard → SQL Editor (in order)
-- =============================================================================
-- After running, run locally:  npx prisma generate
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Migration: add User phone + SMS opt-out (20260226120000_add_user_phone_sms_optout)
-- -----------------------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneE164" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "smsOptOutAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "User_phoneE164_idx" ON "User"("phoneE164");

-- Record so Prisma considers this migration applied
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'b7fbd1678f06a2e17633ab874d7340e5fad4048b857c7d51f7f2e28f82c61668', '20260226120000_add_user_phone_sms_optout', NOW(), NOW(), 1);

-- -----------------------------------------------------------------------------
-- 2) Migration: add Contractor default contact (20260226200000_contractor_default_contact)
-- -----------------------------------------------------------------------------
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "defaultContactId" TEXT;
CREATE INDEX IF NOT EXISTS "Contractor_defaultContactId_idx" ON "Contractor"("defaultContactId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Contractor_defaultContactId_fkey'
  ) THEN
    ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_defaultContactId_fkey"
      FOREIGN KEY ("defaultContactId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Record so Prisma considers this migration applied
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '870df40cd3f8bff61cffdd1c5fb1942ba0605ca8279f29bf2ef903eeb5f242c8', '20260226200000_contractor_default_contact', NOW(), NOW(), 1);
