# If `prisma migrate deploy` fails (e.g. port 5432 unreachable)

Run this SQL in **Supabase Dashboard → SQL Editor** (New query), then run `npx prisma db seed`.

```sql
-- Add Company.slug and Company.allowedEmailDomains (idempotent: safe to run once)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "allowedEmailDomains" TEXT[] NOT NULL DEFAULT '{}';

-- Create unique index (ignore if already exists)
CREATE UNIQUE INDEX IF NOT EXISTS "Company_slug_key" ON "Company"("slug");
```

After it succeeds, run: `npx prisma db seed`
