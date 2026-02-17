# Run full migrations on production

Production is missing columns (e.g. `Company.entitlementsJson`, `Home.isComplete`) until migrations are applied.

## Quick steps

### 1. Get production database URLs

- **Vercel:** Project → Settings → Environment Variables → copy `DATABASE_URL` and `DIRECT_URL` (Production).
- **Supabase:** Project Settings → Database → Connection string (URI). Use the **pooler** URL (port 6543) for `DATABASE_URL` and the **direct** URL (port 5432) for `DIRECT_URL`.

### 2. Create `.env.production` in the project root (do not commit)

```env
DATABASE_URL="postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[PASSWORD]@db.[ref].supabase.co:5432/postgres?sslmode=require"
```

Replace with your real production values.

### 3. Run the migration script

From the project root in PowerShell:

```powershell
.\scripts\migrate-production.ps1
```

Or without a file, set vars and run once:

```powershell
$env:DATABASE_URL="postgresql://...your-production-DATABASE_URL..."
$env:DIRECT_URL="postgresql://...your-production-DIRECT_URL..."
npx prisma migrate deploy
```

### 4. Confirm

Reload `https://usephase.app/billing`. The page should load without the "column does not exist" errors.

---

Migrations that will be applied (if not already) include:

- `home_completion_and_entitlements` → `Home.isComplete`, `Home.completedAt`, `Company.entitlementsJson`
- `stripe_billing` → Stripe fields on Company, `SubscriptionEventLog` table
- Any earlier pending migrations in `prisma/migrations/`
