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

You can’t run `prisma migrate deploy` from that machine. Options:

- **A. Run migrations from somewhere that can reach 5432** (e.g. home network, CI that has access, or Supabase’s “Run migrations” if available).
- **B. Apply the migration by hand, then mark it applied:**
  1. In Supabase Dashboard → **SQL Editor**, run the migration SQL (e.g. from `prisma/migrations/20260219000000_add_user_terms_accepted/migration.sql`).
  2. Locally run:  
     `npx prisma migrate resolve --applied "20260219000000_add_user_terms_accepted"`  
     (use your migration folder name).
  3. Run `npx prisma generate`.

## Verify

After fixing `DIRECT_URL` and re-running:

```powershell
npx prisma migrate deploy
```

You should see “X migration(s) applied” or “No pending migrations” and then the command exits.
