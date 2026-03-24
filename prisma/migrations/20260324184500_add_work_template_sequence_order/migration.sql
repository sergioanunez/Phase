-- AlterTable
ALTER TABLE "WorkTemplateItem" ADD COLUMN "sequenceOrder" INTEGER;

-- CreateIndex
CREATE INDEX "WorkTemplateItem_companyId_sequenceOrder_idx" ON "WorkTemplateItem"("companyId", "sequenceOrder");
