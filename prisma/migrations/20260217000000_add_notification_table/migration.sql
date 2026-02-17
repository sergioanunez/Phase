-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('CRITICAL', 'ATTENTION', 'INFO');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SCHEDULE', 'QUALITY', 'CONTRACTOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('HOME', 'TASK', 'PUNCH', 'CONTRACTOR', 'USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationTargetRole" AS ENUM ('SUPERINTENDENT', 'MANAGER', 'ADMIN', 'ANY');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" "NotificationEntityType" NOT NULL,
    "entityId" TEXT,
    "homeId" TEXT,
    "createdByUserId" TEXT,
    "targetRole" "NotificationTargetRole" NOT NULL,
    "targetUserId" TEXT,
    "requiresAction" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_companyId_idx" ON "Notification"("companyId");

-- CreateIndex
CREATE INDEX "Notification_homeId_idx" ON "Notification"("homeId");

-- CreateIndex
CREATE INDEX "Notification_targetUserId_idx" ON "Notification"("targetUserId");

-- CreateIndex
CREATE INDEX "Notification_companyId_entityType_entityId_category_severity_idx" ON "Notification"("companyId", "entityType", "entityId", "category", "severity");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
