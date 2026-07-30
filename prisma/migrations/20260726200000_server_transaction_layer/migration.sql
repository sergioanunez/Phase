-- Server transaction guarantees: ProcessedMutation, OutboxMessage, aggregate versions

-- Enums
DO $$ BEGIN
  CREATE TYPE "ProcessedMutationStatus" AS ENUM ('processing', 'succeeded', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OutboxMessageStatus" AS ENUM ('pending', 'processing', 'retrying', 'succeeded', 'permanently_failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Version columns (safe defaults for existing rows)
ALTER TABLE "Home" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HomeTask" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PunchItem" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "HomeTask_companyId_idx" ON "HomeTask"("companyId");
CREATE INDEX IF NOT EXISTS "PunchItem_companyId_idx" ON "PunchItem"("companyId");

-- ProcessedMutation
CREATE TABLE IF NOT EXISTS "ProcessedMutation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "mutationType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" "ProcessedMutationStatus" NOT NULL DEFAULT 'processing',
    "responseData" JSONB,
    "responseHash" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ProcessedMutation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProcessedMutation_companyId_idempotencyKey_key"
  ON "ProcessedMutation"("companyId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ProcessedMutation_companyId_createdAt_idx"
  ON "ProcessedMutation"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProcessedMutation_companyId_mutationType_idx"
  ON "ProcessedMutation"("companyId", "mutationType");
CREATE INDEX IF NOT EXISTS "ProcessedMutation_actorUserId_createdAt_idx"
  ON "ProcessedMutation"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProcessedMutation_status_createdAt_idx"
  ON "ProcessedMutation"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProcessedMutation_companyId_fkey'
  ) THEN
    ALTER TABLE "ProcessedMutation"
      ADD CONSTRAINT "ProcessedMutation_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProcessedMutation_actorUserId_fkey'
  ) THEN
    ALTER TABLE "ProcessedMutation"
      ADD CONSTRAINT "ProcessedMutation_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- OutboxMessage
CREATE TABLE IF NOT EXISTS "OutboxMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "aggregateType" TEXT,
    "aggregateId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "OutboxMessageStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "processingAttemptId" TEXT,
    "providerReference" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OutboxMessage_companyId_deduplicationKey_key"
  ON "OutboxMessage"("companyId", "deduplicationKey");
CREATE INDEX IF NOT EXISTS "OutboxMessage_status_nextAttemptAt_idx"
  ON "OutboxMessage"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "OutboxMessage_companyId_createdAt_idx"
  ON "OutboxMessage"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboxMessage_type_status_idx"
  ON "OutboxMessage"("type", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OutboxMessage_companyId_fkey'
  ) THEN
    ALTER TABLE "OutboxMessage"
      ADD CONSTRAINT "OutboxMessage_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
