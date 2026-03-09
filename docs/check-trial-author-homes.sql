-- Run these in Supabase SQL Editor to verify trial logic for "Author Homes"
-- Table names: "Company", "User" (Prisma default)

-- 1) Find Author Homes company and its trial fields
SELECT
  id,
  name,
  status,
  "subscriptionStatus",
  "trialStartsAt",
  "trialEndsAt",
  "createdAt"
FROM "Company"
WHERE name ILIKE '%Author Homes%';

-- 2) Get the company id from above, then check users linked to it (replace YOUR_COMPANY_ID)
-- SELECT id, name, email, "companyId", role, "createdAt"
-- FROM "User"
-- WHERE "companyId" = 'YOUR_COMPANY_ID';

-- Or in one go: company + users for Author Homes
SELECT
  c.id AS company_id,
  c.name AS company_name,
  c.status AS company_status,
  c."subscriptionStatus",
  c."trialStartsAt",
  c."trialEndsAt",
  u.id AS user_id,
  u.email,
  u."companyId" AS user_company_id
FROM "Company" c
LEFT JOIN "User" u ON u."companyId" = c.id
WHERE c.name ILIKE '%Author Homes%';

-- Trial logic in app expects:
-- - Company: status = 'TRIAL', subscriptionStatus = 'trialing', trialStartsAt and trialEndsAt set
-- - User: companyId = that company's id (so /api/billing/status can resolve tenant)
-- If any of these are wrong, fix with:

-- Fix company trial fields (replace YOUR_COMPANY_ID):
-- UPDATE "Company"
-- SET status = 'TRIAL', "subscriptionStatus" = 'trialing',
--     "trialStartsAt" = COALESCE("trialStartsAt", NOW()),
--     "trialEndsAt" = COALESCE("trialEndsAt", NOW() + INTERVAL '30 days')
-- WHERE id = 'YOUR_COMPANY_ID';

-- Fix user company link (replace USER_ID and COMPANY_ID):
-- UPDATE "User" SET "companyId" = 'COMPANY_ID' WHERE id = 'USER_ID';
