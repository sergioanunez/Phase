-- CreateEnum
CREATE TYPE "InviteEmailLogStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "InviteEmailLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "InviteEmailLogStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InviteEmailLog_idempotencyKey_key" ON "InviteEmailLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InviteEmailLog_companyId_idx" ON "InviteEmailLog"("companyId");

-- CreateIndex
CREATE INDEX "InviteEmailLog_idempotencyKey_idx" ON "InviteEmailLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InviteEmailLog_createdAt_idx" ON "InviteEmailLog"("createdAt");

-- AddForeignKey
ALTER TABLE "InviteEmailLog" ADD CONSTRAINT "InviteEmailLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
