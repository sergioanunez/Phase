-- Phase A3: PunchItem clientGeneratedId for Transaction Engine create reconciliation

ALTER TABLE "PunchItem" ADD COLUMN IF NOT EXISTS "clientGeneratedId" TEXT;

-- Unique (companyId, clientGeneratedId). PostgreSQL allows multiple NULLs in unique columns,
-- so legacy rows without clientGeneratedId remain valid.
CREATE UNIQUE INDEX IF NOT EXISTS "PunchItem_companyId_clientGeneratedId_key"
  ON "PunchItem"("companyId", "clientGeneratedId");
