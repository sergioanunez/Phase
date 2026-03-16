-- Add startedAt timestamp to HomeTask to record when work begins.

ALTER TABLE "HomeTask"
ADD COLUMN "startedAt" TIMESTAMP;

