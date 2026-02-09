# Multi-Tenancy (BuildFlow)

BuildFlow uses **single-database, shared-schema multi-tenancy**. Each **Company** is a tenant; users belong to exactly one company. All business data is scoped by `companyId`.

## Migration & backfill (existing databases)

1. **Apply schema changes** (adds `Company`, optional `companyId` on all tenant tables, `ContractorAssignment`):

   ```bash
   npx prisma migrate dev --name add_multi_tenancy
   ```

2. **Run backfill** to create a default company and set `companyId` on all existing rows:

   ```bash
   npx tsx scripts/backfill-company.ts
   ```

   Or with ts-node:

   ```bash
   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-company.ts
   ```

   Set `DEFAULT_COMPANY_NAME` (env) to override the default company name (e.g. "Cullers Homes").

3. **(Optional) Make `companyId` required**  
   After backfill, you can change optional `companyId` fields to required in `prisma/schema.prisma` and run a second migration. Until then, the app works with optional `companyId` and the backfill ensures all existing rows have a value.

## New installs (seed)

For a fresh database, run:

```bash
npx prisma migrate dev
npx prisma db seed
```

The seed creates one **Company** and assigns all users, subdivisions, contractors, homes, template items, etc. to that company.

## Auth & tenant context

- **`requireTenantContext()`** (in `lib/tenant.ts`) loads the current user from the DB and returns `{ userId, companyId, role, contractorId?, companyName? }`. If the user has no `companyId`, it returns 403 with a message to contact the admin.
- **`requireTenantPermission(permission)`** (in `lib/rbac.ts`) calls `requireTenantContext()` and checks the permission for the user’s role; use this in API routes.
- All API routes that touch tenant data must scope reads/writes by `ctx.companyId` and pass `companyId` when creating records.

## Subcontractor restrictions

- Subcontractors see only **homes they’re assigned to** via `ContractorAssignment` (and tasks on those homes).
- Assignments are created when a task is assigned a contractor (in task PATCH) and by the backfill from existing task assignments.
- Helper: **`getAssignedHomeIdsForContractor(companyId, contractorId)`** returns the list of home IDs a subcontractor can access.

## RBAC

- **Admin**: full access within the company.
- **Manager**: read homes/tasks/contractors, dashboard.
- **Superintendent**: read/write homes (assigned only), tasks, contractors, SMS.
- **Subcontractor**: my-week and task confirmations only; data restricted to assigned homes.

## Optional: company name in UI

- **GET /api/me** returns `companyName` (and `companyId`, `role`, `contractorId`). The navbar or layout can call this and show the company name.

## Verification (cross-tenant isolation)

Run the script in `scripts/verify-tenant-isolation.ts` (see below) to check that:

- A user in company A cannot read or update a home from company B.
- A subcontractor cannot see an unassigned home in the same company.
