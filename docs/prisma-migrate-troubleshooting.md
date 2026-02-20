# Prisma migrate deploy stalling or P1017

## What you see

- `npx prisma migrate deploy` (or `prisma migrate dev`) prints "Datasource...", then **hangs** with no output.
- Or you get **P1017: Server has closed the connection**.

## Cause

Migrations must use a **direct** connection to Postgres (Supabase **port 5432**). If Prisma uses the **pooler** (port 6543) or the direct connection is unreachable, the process can stall or drop with P1017.

## Fixes

### 1. Stop the stalled command

In PowerShell: **Ctrl+C**.

### 2. Check your `.env`

- **DATABASE_URL** – must be the **pooler** URL (e.g. `...pooler.supabase.com:6543/...?sslmode=require&pgbouncer=true`). Used at runtime only.
- **DIRECT_URL** – must be the **direct** URL (e.g. `...db.xxxx.supabase.co:5432/...?sslmode=require`). Used for `migrate deploy` and `migrate dev`.

If `DIRECT_URL` is missing or points to the pooler (6543), set it to the direct connection (5432) from Supabase: Project Settings → Database → Connection string → **URI** (use the one with port **5432**).

### 3. Avoid long hangs: add a connection timeout

Add `connect_timeout=10` to `DIRECT_URL` so Prisma fails in ~10 seconds instead of hanging:

```env
DIRECT_URL="postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres?sslmode=require&connect_timeout=10"
```

### 4. If port 5432 is blocked (e.g. corporate network)

You can’t run `prisma migrate deploy` or `prisma migrate resolve` from that machine (both need a DB connection). Options:

- **A. Run migrations from somewhere that can reach 5432** (e.g. home network, CI that has access).
- **B. Apply migration in Supabase and mark it applied via Supabase (no local DB connection):**
  1. In Supabase → **SQL Editor**, run the migration SQL (e.g. from `prisma/migrations/.../migration.sql`).
  2. In Supabase → **SQL Editor** again, run the “Record migration in _prisma_migrations” SQL below (so Prisma’s history matches). Use the migration name and checksum for your migration.
  3. Locally run **only** `npx prisma generate` (no DB connection).

**Record migration in _prisma_migrations (run in Supabase SQL Editor):**

For migration `20260219000000_add_user_terms_accepted` (terms acceptance columns), run:

```sql
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  '36525d39a1f9a047c5e781ab2256a7fa00bfbbadd3abfb6e7e5621508fdfc369',
  '20260219000000_add_user_terms_accepted',
  NOW(),
  NOW(),
  1
);
```

Then locally: `npx prisma generate`.

## Verify

After fixing `DIRECT_URL` and re-running:

```powershell
npx prisma migrate deploy
```

You should see “X migration(s) applied” or “No pending migrations” and then the command exits.
