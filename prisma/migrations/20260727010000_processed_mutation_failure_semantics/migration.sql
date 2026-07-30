-- Phase A2.5: refine ProcessedMutation failure semantics
-- Map legacy "failed" → "rejected" (conservative permanent mapping).

DO $$ BEGIN
  CREATE TYPE "ProcessedMutationStatus_new" AS ENUM (
    'processing',
    'succeeded',
    'rejected',
    'retryable_failed',
    'uncertain'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ProcessedMutation" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "ProcessedMutation"
  ALTER COLUMN "status" TYPE "ProcessedMutationStatus_new"
  USING (
    CASE "status"::text
      WHEN 'failed' THEN 'rejected'::"ProcessedMutationStatus_new"
      WHEN 'processing' THEN 'processing'::"ProcessedMutationStatus_new"
      WHEN 'succeeded' THEN 'succeeded'::"ProcessedMutationStatus_new"
      WHEN 'rejected' THEN 'rejected'::"ProcessedMutationStatus_new"
      WHEN 'retryable_failed' THEN 'retryable_failed'::"ProcessedMutationStatus_new"
      WHEN 'uncertain' THEN 'uncertain'::"ProcessedMutationStatus_new"
      ELSE 'rejected'::"ProcessedMutationStatus_new"
    END
  );

DROP TYPE IF EXISTS "ProcessedMutationStatus";

ALTER TYPE "ProcessedMutationStatus_new" RENAME TO "ProcessedMutationStatus";

ALTER TABLE "ProcessedMutation"
  ALTER COLUMN "status" SET DEFAULT 'processing'::"ProcessedMutationStatus";
