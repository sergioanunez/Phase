-- Additive: persistent contractor Punch Lists; existing PunchItems remain valid with null punchListId.
CREATE TABLE "PunchList" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "homeTaskId" TEXT,
    "assignedContractorId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "clientGeneratedId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PunchList_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PunchList_companyId_clientGeneratedId_key" ON "PunchList"("companyId", "clientGeneratedId");
CREATE INDEX "PunchList_companyId_idx" ON "PunchList"("companyId");
CREATE INDEX "PunchList_companyId_homeId_idx" ON "PunchList"("companyId", "homeId");
CREATE INDEX "PunchList_homeId_idx" ON "PunchList"("homeId");
CREATE INDEX "PunchList_homeTaskId_idx" ON "PunchList"("homeTaskId");
CREATE INDEX "PunchList_assignedContractorId_idx" ON "PunchList"("assignedContractorId");
CREATE INDEX "PunchList_createdByUserId_idx" ON "PunchList"("createdByUserId");

ALTER TABLE "PunchList" ADD CONSTRAINT "PunchList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PunchList" ADD CONSTRAINT "PunchList_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PunchList" ADD CONSTRAINT "PunchList_homeTaskId_fkey" FOREIGN KEY ("homeTaskId") REFERENCES "HomeTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PunchList" ADD CONSTRAINT "PunchList_assignedContractorId_fkey" FOREIGN KEY ("assignedContractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PunchList" ADD CONSTRAINT "PunchList_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PunchItem" ADD COLUMN "punchListId" TEXT;

CREATE INDEX "PunchItem_punchListId_idx" ON "PunchItem"("punchListId");

ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_punchListId_fkey" FOREIGN KEY ("punchListId") REFERENCES "PunchList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
