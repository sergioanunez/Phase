-- CreateTable
CREATE TABLE "ActivityNotificationRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "activityKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityNotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivityNotificationRead_userId_activityKey_key" ON "ActivityNotificationRead"("userId", "activityKey");
CREATE INDEX "ActivityNotificationRead_userId_companyId_idx" ON "ActivityNotificationRead"("userId", "companyId");

ALTER TABLE "ActivityNotificationRead" ADD CONSTRAINT "ActivityNotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityNotificationRead" ADD CONSTRAINT "ActivityNotificationRead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
