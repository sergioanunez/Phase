-- Web Push (VAPID) subscriptions and preferences
CREATE TABLE "WebPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");
CREATE INDEX "WebPushSubscription_userId_companyId_idx" ON "WebPushSubscription"("userId", "companyId");
CREATE INDEX "WebPushSubscription_companyId_idx" ON "WebPushSubscription"("companyId");

ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserWebPushPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notifySubcontractorReply" BOOLEAN NOT NULL DEFAULT true,
    "notifyFlowAlerts" BOOLEAN NOT NULL DEFAULT true,
    "notifyPunchlist" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWebPushPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserWebPushPreference_userId_companyId_key" ON "UserWebPushPreference"("userId", "companyId");
CREATE INDEX "UserWebPushPreference_companyId_idx" ON "UserWebPushPreference"("companyId");

ALTER TABLE "UserWebPushPreference" ADD CONSTRAINT "UserWebPushPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserWebPushPreference" ADD CONSTRAINT "UserWebPushPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebPushDedup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebPushDedup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebPushDedup_key_key" ON "WebPushDedup"("key");
CREATE INDEX "WebPushDedup_createdAt_idx" ON "WebPushDedup"("createdAt");
