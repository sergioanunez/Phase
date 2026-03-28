-- CreateTable
CREATE TABLE "MarketingToolLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "source" TEXT NOT NULL,
    "formVariant" TEXT,
    "inputs" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingToolLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingToolLead_email_idx" ON "MarketingToolLead"("email");

-- CreateIndex
CREATE INDEX "MarketingToolLead_source_createdAt_idx" ON "MarketingToolLead"("source", "createdAt");
