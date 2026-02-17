-- AlterTable
ALTER TABLE "Company" ADD COLUMN "slug" TEXT,
ADD COLUMN "allowedEmailDomains" TEXT[] NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");
