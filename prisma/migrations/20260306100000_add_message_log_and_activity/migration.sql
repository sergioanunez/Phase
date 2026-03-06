-- CreateEnum
CREATE TYPE "SmsMessageType" AS ENUM ('scheduled', 'cancelled', 'punchlist', 'confirmation', 'general');

-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('task_scheduled', 'task_rescheduled', 'task_cancelled', 'task_completed', 'task_reported_complete', 'sms_sent', 'sms_confirmed', 'sms_declined', 'punchlist_sent', 'punchlist_completed', 'inspection_passed', 'inspection_failed', 'home_started', 'home_completed');

-- AlterTable: Add new columns to SmsMessage
ALTER TABLE "SmsMessage" ADD COLUMN "messageType" "SmsMessageType";
ALTER TABLE "SmsMessage" ADD COLUMN "homeId" TEXT;
ALTER TABLE "SmsMessage" ADD COLUMN "recipientName" TEXT;

-- CreateIndex
CREATE INDEX "SmsMessage_homeId_idx" ON "SmsMessage"("homeId");

-- CreateIndex
CREATE INDEX "SmsMessage_messageType_idx" ON "SmsMessage"("messageType");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "taskId" TEXT,
    "punchItemId" TEXT,
    "eventType" "ActivityEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actorName" TEXT,
    "recipientName" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityEvent_companyId_idx" ON "ActivityEvent"("companyId");

-- CreateIndex
CREATE INDEX "ActivityEvent_homeId_idx" ON "ActivityEvent"("homeId");

-- CreateIndex
CREATE INDEX "ActivityEvent_taskId_idx" ON "ActivityEvent"("taskId");

-- CreateIndex
CREATE INDEX "ActivityEvent_eventType_idx" ON "ActivityEvent"("eventType");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_homeId_createdAt_idx" ON "ActivityEvent"("homeId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
