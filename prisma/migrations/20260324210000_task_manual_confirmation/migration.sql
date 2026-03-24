-- CreateEnum
CREATE TYPE "TaskConfirmationSource" AS ENUM ('Manual', 'Sms');

-- AlterEnum
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'task_manually_confirmed';

-- AlterTable
ALTER TABLE "HomeTask" ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmedByUserId" TEXT,
ADD COLUMN "confirmationSource" "TaskConfirmationSource";

-- CreateIndex
CREATE INDEX "HomeTask_confirmedByUserId_idx" ON "HomeTask"("confirmedByUserId");

-- AddForeignKey
ALTER TABLE "HomeTask" ADD CONSTRAINT "HomeTask_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
