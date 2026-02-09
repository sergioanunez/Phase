# Fix for P3015: Migration file not found

Prisma is looking for `prisma/migrations/initial_cullers_schema/migration.sql` because that migration is recorded in your database’s `_prisma_migrations` table, but the file doesn’t exist in this project (e.g. it was never committed or was deleted).

**Fix: remove the orphan record from the database, then create the new migration.**

## Steps

1. **Open Supabase Dashboard** → your project → **SQL Editor**.

2. **Run this SQL** (removes the missing migration from history):

   ```sql
   DELETE FROM _prisma_migrations
   WHERE migration_name = 'initial_cullers_schema';
   ```

3. **From the project root, run:**

   ```powershell
   npx prisma migrate dev --name add_multi_tenancy
   ```

   Prisma will generate a migration that adds the multi-tenancy changes (Company, companyId, ContractorAssignment, etc.) and apply it.

**If you still see schema validation errors** (e.g. `ContractorAssignment` or `companyId` on Home), make sure `prisma/schema.prisma` is saved and that it includes the `ContractorAssignment` model and `companyId` on the `Home` model. The version in this repo already has those.
