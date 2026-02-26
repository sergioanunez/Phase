# If `prisma migrate dev` / `deploy` / `resolve` gets stuck in the terminal

Prisma commands that connect to the DB (migrate, resolve) can hang on some networks. Do **everything below in the Supabase SQL Editor** and one local script that does **not** connect to the DB. No `prisma migrate` or `prisma migrate resolve` needed.

## 1. Apply the schema SQL (Supabase SQL Editor)

In **Supabase Dashboard → SQL Editor**, run:

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneE164" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "smsOptOutAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_phoneE164_idx" ON "User"("phoneE164");
```

## 2. Record the migration in Prisma’s table (Supabase SQL Editor)

You need to insert a row into `_prisma_migrations` so Prisma considers this migration applied.

**Option A — paste this in Supabase SQL Editor** (checksum precomputed):

```sql
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'b7fbd1678f06a2e17633ab874d7340e5fad4048b857c7d51f7f2e28f82c61668', '20260226120000_add_user_phone_sms_optout', NOW(), NOW(), 1);
```

**Option B — generate the INSERT yourself** (Node only, no DB): run in your project folder:

```bash
node scripts/print-migration-checksum.js 20260226120000_add_user_phone_sms_optout
```

Then copy the INSERT from the output and run it in Supabase SQL Editor.

## 3. Regenerate the client (local terminal)

```bash
npx prisma generate
```

`prisma generate` does **not** connect to the database; it only reads `schema.prisma` and updates the client. It should not hang.

---

Done. No `prisma migrate` or `prisma migrate resolve` needed. Future deploys that run `prisma migrate deploy` (e.g. from CI) will see this migration as already applied.
