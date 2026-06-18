-- CreateEnum
CREATE TYPE "InviteDeliveryMethod" AS ENUM ('EMAIL', 'SMS', 'BOTH');

-- AlterTable
ALTER TABLE "UserInvite" ADD COLUMN     "phoneE164" TEXT,
ADD COLUMN     "inviteDeliveryMethod" "InviteDeliveryMethod" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "emailSentAt" TIMESTAMP(3),
ADD COLUMN     "smsSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "UserInvite_phoneE164_idx" ON "UserInvite"("phoneE164");
