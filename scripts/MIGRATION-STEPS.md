# Run full migration on production – step by step

## Step 1: Get production database URLs

**If you use Vercel:**
1. Open your Vercel project (Phase app).
2. Go to **Settings** → **Environment Variables**.
3. Find **DATABASE_URL** and **DIRECT_URL** for the **Production** environment.
4. Copy both values (click the value to reveal, then copy). Keep them somewhere safe for Step 2.

**If you use Supabase (or Vercel vars point to Supabase):**
1. Open Supabase dashboard → your project.
2. Go to **Project Settings** (gear) → **Database**.
3. Under **Connection string**, choose **URI**.
4. Copy the **Transaction pooler** URL (port **6543**) → this is your **DATABASE_URL**.
5. Copy the **Session pooler** / direct URL (port **5432**) → this is your **DIRECT_URL**.
   - Replace `[YOUR-PASSWORD]` with your actual database password.

---

## Step 2: Create `.env.production` in the project root

1. Open your project in File Explorer:  
   `C:\Users\Dell\Desktop\Work\ACTIVOS\Cullers Homes\Phase App`
2. In that folder (same level as `package.json`), create a new file named:  
   **`.env.production`**
3. Open it in a text editor and paste these two lines, then replace the `...` with the URLs you copied in Step 1:

```env
DATABASE_URL="postgresql://postgres.xxxx:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxx:YOUR_PASSWORD@db.xxxx.supabase.co:5432/postgres?sslmode=require"
```

4. Save the file.  
   Do **not** commit this file (it’s already in `.gitignore`).

---

## Step 3: Run the migration

1. Open **PowerShell** (or Windows Terminal).
2. Go to the project folder:

```powershell
cd "C:\Users\Dell\Desktop\Work\ACTIVOS\Cullers Homes\Phase App"
```

3. Run the migration script:

```powershell
.\scripts\migrate-production.ps1
```

4. You should see output like:
   - `Loading .env.production...`
   - `Running migrations against the database...`
   - A list of migrations applied (e.g. `Applied migration 20260215210000_home_completion_and_entitlements`)
   - `Done.`

If you see **“No pending migrations”**, the database was already up to date.  
If you see an **error**, copy the full message and use it to fix the issue (e.g. wrong URL, network, or permissions).

---

## Step 4: Confirm it worked

1. Open your browser and go to: **https://usephase.app/billing**
2. Log in if needed.
3. The Billing page should load **without** errors like:
   - “The column 'Company.entitlementsJson' does not exist”
   - “The column 'Home.isComplete' does not exist”

If the page loads and shows your plan / usage, the full migration ran successfully.

---

## Optional: Run migration without `.env.production`

If you prefer not to create a file, you can set the URLs only for that PowerShell session:

1. Open PowerShell and go to the project folder (Step 3.2 above).
2. Run these two lines (paste your real URLs between the quotes):

```powershell
$env:DATABASE_URL="postgresql://...your-production-DATABASE_URL..."
$env:DIRECT_URL="postgresql://...your-production-DIRECT_URL..."
```

3. Then run:

```powershell
npx prisma migrate deploy
```

The result is the same as using the script with `.env.production`.
