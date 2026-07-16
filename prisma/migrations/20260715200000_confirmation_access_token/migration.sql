-- AlterEnum: MagicLink confirmation source
ALTER TYPE "TaskConfirmationSource" ADD VALUE IF NOT EXISTS 'MagicLink';

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConfirmationAccessToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "contractorId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ConfirmationAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConfirmationAccessToken_tokenHash_key" ON "ConfirmationAccessToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "ConfirmationAccessToken_companyId_phoneNormalized_idx" ON "ConfirmationAccessToken"("companyId", "phoneNormalized");
CREATE INDEX IF NOT EXISTS "ConfirmationAccessToken_expiresAt_idx" ON "ConfirmationAccessToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "ConfirmationAccessToken_phoneNormalized_idx" ON "ConfirmationAccessToken"("phoneNormalized");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ConfirmationAccessToken_companyId_fkey'
  ) THEN
    ALTER TABLE "ConfirmationAccessToken"
      ADD CONSTRAINT "ConfirmationAccessToken_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
