-- AlterTable WorkTemplateItem: add Flow Mode fields (prep lead, ordering, material lead)
ALTER TABLE "WorkTemplateItem" ADD COLUMN IF NOT EXISTS "prepLeadDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkTemplateItem" ADD COLUMN IF NOT EXISTS "requiresOrdering" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkTemplateItem" ADD COLUMN IF NOT EXISTS "materialLeadDays" INTEGER NOT NULL DEFAULT 0;
