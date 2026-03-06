-- CreateTable
CREATE TABLE "PunchlistShare" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "homeId" TEXT NOT NULL,
    "homeTaskId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dueDate" TIMESTAMP(3),
    "recipientPhone" TEXT,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PunchlistShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PunchlistShare_token_key" ON "PunchlistShare"("token");

-- CreateIndex
CREATE INDEX "PunchlistShare_companyId_idx" ON "PunchlistShare"("companyId");

-- CreateIndex
CREATE INDEX "PunchlistShare_homeId_idx" ON "PunchlistShare"("homeId");

-- CreateIndex
CREATE INDEX "PunchlistShare_homeTaskId_idx" ON "PunchlistShare"("homeTaskId");

-- CreateIndex
CREATE INDEX "PunchlistShare_token_idx" ON "PunchlistShare"("token");

-- AddForeignKey
ALTER TABLE "PunchlistShare" ADD CONSTRAINT "PunchlistShare_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchlistShare" ADD CONSTRAINT "PunchlistShare_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
