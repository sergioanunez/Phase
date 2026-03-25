-- CreateTable
CREATE TABLE "WorkTemplateCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryPosition" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTemplateCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkTemplateCategory_companyId_name_key" ON "WorkTemplateCategory"("companyId", "name");

CREATE INDEX "WorkTemplateCategory_companyId_categoryPosition_idx" ON "WorkTemplateCategory"("companyId", "categoryPosition");

ALTER TABLE "WorkTemplateCategory" ADD CONSTRAINT "WorkTemplateCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTemplateItem" ADD COLUMN "workTemplateCategoryId" TEXT,
ADD COLUMN "itemPosition" INTEGER NOT NULL DEFAULT 100;

CREATE INDEX "WorkTemplateItem_companyId_workTemplateCategoryId_itemPosition_idx" ON "WorkTemplateItem"("companyId", "workTemplateCategoryId", "itemPosition");

ALTER TABLE "WorkTemplateItem" ADD CONSTRAINT "WorkTemplateItem_workTemplateCategoryId_fkey" FOREIGN KEY ("workTemplateCategoryId") REFERENCES "WorkTemplateCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
