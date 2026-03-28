-- CreateTable
CREATE TABLE "HomePlan" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "companyId" TEXT,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "planFileType" "PlanFileType" NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomePlan_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "HomePlan" ADD CONSTRAINT "HomePlan_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomePlan" ADD CONSTRAINT "HomePlan_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "HomePlan_homeId_idx" ON "HomePlan"("homeId");

-- CreateIndex
CREATE INDEX "HomePlan_homeId_createdAt_idx" ON "HomePlan"("homeId", "createdAt");

-- CreateIndex
CREATE INDEX "HomePlan_companyId_idx" ON "HomePlan"("companyId");
