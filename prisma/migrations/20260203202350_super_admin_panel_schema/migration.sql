-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'TRIAL', 'DISABLED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('OK', 'PAST_DUE', 'CANCELED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "metaJson" JSONB,
ALTER COLUMN "entityType" DROP NOT NULL,
ALTER COLUMN "entityId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "billingStatus" "BillingStatus",
ADD COLUMN     "brandAccentColor" TEXT,
ADD COLUMN     "brandAppName" TEXT,
ADD COLUMN     "brandLogoUrl" TEXT,
ADD COLUMN     "brandPrimaryColor" TEXT,
ADD COLUMN     "monthlyPriceCents" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "renewalDate" TIMESTAMP(3),
ADD COLUMN     "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "SmsMessageLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "direction" TEXT NOT NULL,
    "to" TEXT,
    "from" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "twilioSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsMessageLog_companyId_idx" ON "SmsMessageLog"("companyId");

-- CreateIndex
CREATE INDEX "SmsMessageLog_createdAt_idx" ON "SmsMessageLog"("createdAt");

-- CreateIndex
CREATE INDEX "SmsMessageLog_status_idx" ON "SmsMessageLog"("status");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE INDEX "Company_billingStatus_idx" ON "Company"("billingStatus");

-- AddForeignKey
ALTER TABLE "SmsMessageLog" ADD CONSTRAINT "SmsMessageLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
