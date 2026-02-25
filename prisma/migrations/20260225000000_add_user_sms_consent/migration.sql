-- AlterTable User: add SMS consent tracking fields for toll-free compliance
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "smsConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "smsConsentTimestamp" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "smsConsentSource" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "smsConsentVersion" TEXT;

