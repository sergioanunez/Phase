-- Reported-complete workflow (subcontractor signal; tenant verifies)

ALTER TABLE "HomeTask" ADD COLUMN "reportedCompleteAt" TIMESTAMP(3),
ADD COLUMN "reportedCompleteByUserId" TEXT,
ADD COLUMN "reportedCompleteNote" TEXT;

ALTER TABLE "PunchItem" ADD COLUMN "reportedCompleteAt" TIMESTAMP(3),
ADD COLUMN "reportedCompleteByUserId" TEXT,
ADD COLUMN "reportedCompleteNote" TEXT;

CREATE INDEX "HomeTask_reportedCompleteByUserId_idx" ON "HomeTask"("reportedCompleteByUserId");

CREATE INDEX "PunchItem_reportedCompleteByUserId_idx" ON "PunchItem"("reportedCompleteByUserId");

ALTER TABLE "HomeTask" ADD CONSTRAINT "HomeTask_reportedCompleteByUserId_fkey" FOREIGN KEY ("reportedCompleteByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_reportedCompleteByUserId_fkey" FOREIGN KEY ("reportedCompleteByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
