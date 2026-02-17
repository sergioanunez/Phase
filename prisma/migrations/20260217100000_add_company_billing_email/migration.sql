-- AlterTable Company: add optional billingEmail (Stripe billing)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "billingEmail" TEXT;
