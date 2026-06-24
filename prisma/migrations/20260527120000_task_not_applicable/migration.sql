-- Add NotApplicable task status and N/A metadata fields.

CREATE TYPE "TaskNotApplicableReason" AS ENUM (
  'not_required_for_lot',
  'option_not_selected',
  'covered_by_another_task',
  'builder_decision',
  'other'
);

ALTER TYPE "TaskStatus" ADD VALUE 'NotApplicable';

ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'task_not_applicable';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'task_marked_applicable';

ALTER TABLE "HomeTask"
  ADD COLUMN "notApplicableReason" "TaskNotApplicableReason",
  ADD COLUMN "notApplicableNote" TEXT,
  ADD COLUMN "notApplicableAt" TIMESTAMP(3),
  ADD COLUMN "notApplicableByUserId" TEXT,
  ADD COLUMN "statusBeforeNotApplicable" "TaskStatus";

ALTER TABLE "HomeTask"
  ADD CONSTRAINT "HomeTask_notApplicableByUserId_fkey"
  FOREIGN KEY ("notApplicableByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "HomeTask_notApplicableByUserId_idx" ON "HomeTask"("notApplicableByUserId");
