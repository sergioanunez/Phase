-- CreateEnum
CREATE TYPE "PricingTier" AS ENUM ('SMALL', 'MID', 'LARGE', 'WHITE_LABEL');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Admin', 'Superintendent', 'Manager', 'Subcontractor');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('Unscheduled', 'Scheduled', 'PendingConfirm', 'Confirmed', 'Declined', 'InProgress', 'Completed', 'Canceled');

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('Inbound', 'Outbound');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('Sent', 'Delivered', 'Failed', 'Received');

-- CreateEnum
CREATE TYPE "GateScope" AS ENUM ('DownstreamOnly', 'AllScheduling');

-- CreateEnum
CREATE TYPE "GateBlockMode" AS ENUM ('ScheduleOnly', 'ScheduleAndConfirm');

-- CreateEnum
CREATE TYPE "PunchCategory" AS ENUM ('Structural', 'Framing', 'MEP', 'Drywall', 'Trim', 'Paint', 'Cabinets', 'Flooring', 'Fixtures', 'Exterior', 'Other');

-- CreateEnum
CREATE TYPE "PunchSeverity" AS ENUM ('Minor', 'Major');

-- CreateEnum
CREATE TYPE "PunchStatus" AS ENUM ('Open', 'ReadyForReview', 'Closed', 'Canceled');

-- CreateEnum
CREATE TYPE "PlanFileType" AS ENUM ('PDF', 'IMAGE');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricingTier" "PricingTier" NOT NULL DEFAULT 'SMALL',
    "maxActiveHomes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "contractorId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "resendCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subdivision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subdivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Home" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "subdivisionId" TEXT NOT NULL,
    "addressOrLot" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "targetCompletionDate" TIMESTAMP(3),
    "forecastCompletionDate" TIMESTAMP(3),
    "forecastTotalWorkingDays" INTEGER,
    "forecastComputedAt" TIMESTAMP(3),
    "planName" TEXT,
    "planVariant" TEXT,
    "planStoragePath" TEXT,
    "planFileType" "PlanFileType",
    "planUploadedAt" TIMESTAMP(3),
    "planUploadedByUserId" TEXT,
    "thumbnailStoragePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Home_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTemplateItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "defaultDurationDays" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "optionalCategory" TEXT,
    "isDependency" BOOLEAN NOT NULL DEFAULT false,
    "isCriticalGate" BOOLEAN NOT NULL DEFAULT false,
    "gateScope" "GateScope" NOT NULL DEFAULT 'DownstreamOnly',
    "gateBlockMode" "GateBlockMode" NOT NULL DEFAULT 'ScheduleOnly',
    "gateName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "homeId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "durationDaysSnapshot" INTEGER NOT NULL,
    "sortOrderSnapshot" INTEGER NOT NULL,
    "scheduledDate" TIMESTAMP(3),
    "contractorId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'Unscheduled',
    "lastConfirmationAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "hasOpenPunch" BOOLEAN NOT NULL DEFAULT false,
    "punchOpenCount" INTEGER NOT NULL DEFAULT 0,
    "forecastEarlyStartOffsetWorkingDays" INTEGER,
    "forecastEarlyFinishOffsetWorkingDays" INTEGER,
    "isCriticalPath" BOOLEAN NOT NULL DEFAULT false,
    "blockedByCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateDependency" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "templateItemId" TEXT NOT NULL,
    "dependsOnItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "trade" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "preferredNoticeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "contractorId" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "direction" "SmsDirection" NOT NULL,
    "to" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL,
    "homeTaskId" TEXT,
    "confirmationCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "homeId" TEXT NOT NULL,
    "superintendentUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "homeId" TEXT NOT NULL,
    "relatedHomeTaskId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "assignedContractorId" TEXT,
    "category" "PunchCategory" NOT NULL,
    "severity" "PunchSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "PunchStatus" NOT NULL DEFAULT 'Open',
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PunchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchPhoto" (
    "id" TEXT NOT NULL,
    "punchItemId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PunchPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryGate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "categoryName" TEXT NOT NULL,
    "gateScope" "GateScope" NOT NULL DEFAULT 'DownstreamOnly',
    "gateBlockMode" "GateBlockMode" NOT NULL DEFAULT 'ScheduleOnly',
    "gateName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryGate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Company_pricingTier_idx" ON "Company"("pricingTier");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_contractorId_idx" ON "User"("contractorId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "UserInvite_companyId_idx" ON "UserInvite"("companyId");

-- CreateIndex
CREATE INDEX "UserInvite_userId_idx" ON "UserInvite"("userId");

-- CreateIndex
CREATE INDEX "UserInvite_email_idx" ON "UserInvite"("email");

-- CreateIndex
CREATE INDEX "UserInvite_tokenHash_idx" ON "UserInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "Subdivision_companyId_idx" ON "Subdivision"("companyId");

-- CreateIndex
CREATE INDEX "Subdivision_companyId_name_idx" ON "Subdivision"("companyId", "name");

-- CreateIndex
CREATE INDEX "Subdivision_name_idx" ON "Subdivision"("name");

-- CreateIndex
CREATE INDEX "Home_companyId_idx" ON "Home"("companyId");

-- CreateIndex
CREATE INDEX "Home_companyId_startDate_idx" ON "Home"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "Home_subdivisionId_idx" ON "Home"("subdivisionId");

-- CreateIndex
CREATE INDEX "Home_targetCompletionDate_idx" ON "Home"("targetCompletionDate");

-- CreateIndex
CREATE INDEX "Home_startDate_idx" ON "Home"("startDate");

-- CreateIndex
CREATE INDEX "WorkTemplateItem_companyId_idx" ON "WorkTemplateItem"("companyId");

-- CreateIndex
CREATE INDEX "WorkTemplateItem_companyId_sortOrder_idx" ON "WorkTemplateItem"("companyId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkTemplateItem_sortOrder_idx" ON "WorkTemplateItem"("sortOrder");

-- CreateIndex
CREATE INDEX "WorkTemplateItem_isCriticalGate_idx" ON "WorkTemplateItem"("isCriticalGate");

-- CreateIndex
CREATE INDEX "HomeTask_homeId_idx" ON "HomeTask"("homeId");

-- CreateIndex
CREATE INDEX "HomeTask_contractorId_idx" ON "HomeTask"("contractorId");

-- CreateIndex
CREATE INDEX "HomeTask_status_idx" ON "HomeTask"("status");

-- CreateIndex
CREATE INDEX "HomeTask_scheduledDate_idx" ON "HomeTask"("scheduledDate");

-- CreateIndex
CREATE INDEX "HomeTask_templateItemId_idx" ON "HomeTask"("templateItemId");

-- CreateIndex
CREATE INDEX "HomeTask_hasOpenPunch_idx" ON "HomeTask"("hasOpenPunch");

-- CreateIndex
CREATE INDEX "TemplateDependency_companyId_idx" ON "TemplateDependency"("companyId");

-- CreateIndex
CREATE INDEX "TemplateDependency_templateItemId_idx" ON "TemplateDependency"("templateItemId");

-- CreateIndex
CREATE INDEX "TemplateDependency_dependsOnItemId_idx" ON "TemplateDependency"("dependsOnItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateDependency_templateItemId_dependsOnItemId_key" ON "TemplateDependency"("templateItemId", "dependsOnItemId");

-- CreateIndex
CREATE INDEX "Contractor_companyId_idx" ON "Contractor"("companyId");

-- CreateIndex
CREATE INDEX "Contractor_companyId_active_idx" ON "Contractor"("companyId", "active");

-- CreateIndex
CREATE INDEX "Contractor_phone_idx" ON "Contractor"("phone");

-- CreateIndex
CREATE INDEX "Contractor_active_idx" ON "Contractor"("active");

-- CreateIndex
CREATE INDEX "ContractorAssignment_companyId_idx" ON "ContractorAssignment"("companyId");

-- CreateIndex
CREATE INDEX "ContractorAssignment_contractorId_idx" ON "ContractorAssignment"("contractorId");

-- CreateIndex
CREATE INDEX "ContractorAssignment_homeId_idx" ON "ContractorAssignment"("homeId");

-- CreateIndex
CREATE INDEX "ContractorAssignment_companyId_contractorId_idx" ON "ContractorAssignment"("companyId", "contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorAssignment_contractorId_homeId_key" ON "ContractorAssignment"("contractorId", "homeId");

-- CreateIndex
CREATE INDEX "SmsMessage_companyId_idx" ON "SmsMessage"("companyId");

-- CreateIndex
CREATE INDEX "SmsMessage_to_idx" ON "SmsMessage"("to");

-- CreateIndex
CREATE INDEX "SmsMessage_from_idx" ON "SmsMessage"("from");

-- CreateIndex
CREATE INDEX "SmsMessage_homeTaskId_idx" ON "SmsMessage"("homeTaskId");

-- CreateIndex
CREATE INDEX "SmsMessage_confirmationCode_idx" ON "SmsMessage"("confirmationCode");

-- CreateIndex
CREATE INDEX "SmsMessage_createdAt_idx" ON "SmsMessage"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "HomeAssignment_companyId_idx" ON "HomeAssignment"("companyId");

-- CreateIndex
CREATE INDEX "HomeAssignment_homeId_idx" ON "HomeAssignment"("homeId");

-- CreateIndex
CREATE INDEX "HomeAssignment_superintendentUserId_idx" ON "HomeAssignment"("superintendentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeAssignment_homeId_superintendentUserId_key" ON "HomeAssignment"("homeId", "superintendentUserId");

-- CreateIndex
CREATE INDEX "PunchItem_homeId_idx" ON "PunchItem"("homeId");

-- CreateIndex
CREATE INDEX "PunchItem_relatedHomeTaskId_idx" ON "PunchItem"("relatedHomeTaskId");

-- CreateIndex
CREATE INDEX "PunchItem_createdByUserId_idx" ON "PunchItem"("createdByUserId");

-- CreateIndex
CREATE INDEX "PunchItem_assignedContractorId_idx" ON "PunchItem"("assignedContractorId");

-- CreateIndex
CREATE INDEX "PunchItem_status_idx" ON "PunchItem"("status");

-- CreateIndex
CREATE INDEX "PunchItem_category_idx" ON "PunchItem"("category");

-- CreateIndex
CREATE INDEX "PunchPhoto_punchItemId_idx" ON "PunchPhoto"("punchItemId");

-- CreateIndex
CREATE INDEX "CategoryGate_companyId_idx" ON "CategoryGate"("companyId");

-- CreateIndex
CREATE INDEX "CategoryGate_categoryName_idx" ON "CategoryGate"("categoryName");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryGate_companyId_categoryName_key" ON "CategoryGate"("companyId", "categoryName");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subdivision" ADD CONSTRAINT "Subdivision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Home" ADD CONSTRAINT "Home_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Home" ADD CONSTRAINT "Home_subdivisionId_fkey" FOREIGN KEY ("subdivisionId") REFERENCES "Subdivision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Home" ADD CONSTRAINT "Home_planUploadedByUserId_fkey" FOREIGN KEY ("planUploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTemplateItem" ADD CONSTRAINT "WorkTemplateItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeTask" ADD CONSTRAINT "HomeTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeTask" ADD CONSTRAINT "HomeTask_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeTask" ADD CONSTRAINT "HomeTask_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "WorkTemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeTask" ADD CONSTRAINT "HomeTask_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDependency" ADD CONSTRAINT "TemplateDependency_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDependency" ADD CONSTRAINT "TemplateDependency_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "WorkTemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDependency" ADD CONSTRAINT "TemplateDependency_dependsOnItemId_fkey" FOREIGN KEY ("dependsOnItemId") REFERENCES "WorkTemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_homeTaskId_fkey" FOREIGN KEY ("homeTaskId") REFERENCES "HomeTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeAssignment" ADD CONSTRAINT "HomeAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeAssignment" ADD CONSTRAINT "HomeAssignment_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeAssignment" ADD CONSTRAINT "HomeAssignment_superintendentUserId_fkey" FOREIGN KEY ("superintendentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_relatedHomeTaskId_fkey" FOREIGN KEY ("relatedHomeTaskId") REFERENCES "HomeTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_assignedContractorId_fkey" FOREIGN KEY ("assignedContractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchPhoto" ADD CONSTRAINT "PunchPhoto_punchItemId_fkey" FOREIGN KEY ("punchItemId") REFERENCES "PunchItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryGate" ADD CONSTRAINT "CategoryGate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
