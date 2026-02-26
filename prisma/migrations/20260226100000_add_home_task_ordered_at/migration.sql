-- AlterTable HomeTask: add orderedAt for Flow "Mark ordered" quick action
ALTER TABLE "HomeTask" ADD COLUMN IF NOT EXISTS "orderedAt" TIMESTAMP(3);
