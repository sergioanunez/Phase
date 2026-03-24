-- CreateEnum
CREATE TYPE "TaskRescheduleReason" AS ENUM ('previous_task_incomplete', 'trade_unavailable', 'material_delay', 'inspection_failed', 'weather', 'scheduling_conflict', 'other');

-- AlterTable HomeTask: latest reschedule snapshot
ALTER TABLE "HomeTask" ADD COLUMN "lastRescheduleReason" "TaskRescheduleReason",
ADD COLUMN "lastRescheduleNote" TEXT,
ADD COLUMN "lastRescheduledAt" TIMESTAMP(3),
ADD COLUMN "lastRescheduledByUserId" TEXT,
ADD COLUMN "lastPreviousScheduledDate" TIMESTAMP(3),
ADD COLUMN "rescheduleCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "HomeTask" ADD CONSTRAINT "HomeTask_lastRescheduledByUserId_fkey" FOREIGN KEY ("lastRescheduledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "HomeTask_lastRescheduledByUserId_idx" ON "HomeTask"("lastRescheduledByUserId");

-- CreateTable TaskRescheduleHistory
CREATE TABLE "TaskRescheduleHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "previousScheduledDate" TIMESTAMP(3) NOT NULL,
    "newScheduledDate" TIMESTAMP(3) NOT NULL,
    "reason" "TaskRescheduleReason" NOT NULL,
    "note" TEXT,
    "rescheduledByUserId" TEXT NOT NULL,
    "smsResent" BOOLEAN NOT NULL DEFAULT false,
    "statusBefore" "TaskStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskRescheduleHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskRescheduleHistory_companyId_createdAt_idx" ON "TaskRescheduleHistory"("companyId", "createdAt");
CREATE INDEX "TaskRescheduleHistory_homeId_createdAt_idx" ON "TaskRescheduleHistory"("homeId", "createdAt");
CREATE INDEX "TaskRescheduleHistory_taskId_createdAt_idx" ON "TaskRescheduleHistory"("taskId", "createdAt");

ALTER TABLE "TaskRescheduleHistory" ADD CONSTRAINT "TaskRescheduleHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRescheduleHistory" ADD CONSTRAINT "TaskRescheduleHistory_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRescheduleHistory" ADD CONSTRAINT "TaskRescheduleHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HomeTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRescheduleHistory" ADD CONSTRAINT "TaskRescheduleHistory_rescheduledByUserId_fkey" FOREIGN KEY ("rescheduledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
