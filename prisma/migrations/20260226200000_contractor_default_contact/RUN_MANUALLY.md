# If `prisma migrate` gets stuck

Apply this migration in **Supabase SQL Editor**, then record it.

## 1. Run the SQL (Supabase SQL Editor)

```sql
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "defaultContactId" TEXT;
CREATE INDEX IF NOT EXISTS "Contractor_defaultContactId_idx" ON "Contractor"("defaultContactId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contractor_defaultContactId_fkey') THEN
    ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_defaultContactId_fkey"
      FOREIGN KEY ("defaultContactId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
```

## 2. Record the migration

Run `node scripts/print-migration-checksum.js 20260226200000_contractor_default_contact` to get the INSERT, or use Prisma from a machine that can reach the DB:  
`npx prisma migrate resolve --applied 20260226200000_contractor_default_contact`

Then: `npx prisma generate`
