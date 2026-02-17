-- AlterTable Home: add isComplete and completedAt for billing (active homes = !isComplete)
ALTER TABLE "Home" ADD COLUMN "isComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Home" ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex for efficient active-homes count by tenant
CREATE INDEX "Home_companyId_isComplete_idx" ON "Home"("companyId", "isComplete");

-- AlterTable Company: add entitlementsJson for billing entitlements (maxActiveHomes, maxUsers, whiteLabelEnabled)
ALTER TABLE "Company" ADD COLUMN "entitlementsJson" JSONB;
