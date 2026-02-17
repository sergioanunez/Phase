-- AlterTable Company: Stripe billing fields
ALTER TABLE "Company" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Company" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Company" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "Company" ADD COLUMN "planKey" TEXT;
ALTER TABLE "Company" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

CREATE UNIQUE INDEX "Company_stripeCustomerId_key" ON "Company"("stripeCustomerId");
CREATE UNIQUE INDEX "Company_stripeSubscriptionId_key" ON "Company"("stripeSubscriptionId");

-- CreateTable SubscriptionEventLog (webhook idempotency + debugging)
CREATE TABLE "SubscriptionEventLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEventLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionEventLog_stripeEventId_key" ON "SubscriptionEventLog"("stripeEventId");
CREATE INDEX "SubscriptionEventLog_companyId_idx" ON "SubscriptionEventLog"("companyId");
CREATE INDEX "SubscriptionEventLog_createdAt_idx" ON "SubscriptionEventLog"("createdAt");

ALTER TABLE "SubscriptionEventLog" ADD CONSTRAINT "SubscriptionEventLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
