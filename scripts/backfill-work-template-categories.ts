/**
 * After migrating to WorkTemplateCategory, link existing template items and recompute sequenceOrder.
 *
 *   npx tsx scripts/backfill-work-template-categories.ts           # all companies
 *   npx tsx scripts/backfill-work-template-categories.ts <id>    # one company
 */
import { PrismaClient } from "@prisma/client"
import { backfillWorkTemplateCategoriesForCompany } from "../lib/work-template-sequence"

const prisma = new PrismaClient()

async function main() {
  const arg = process.argv[2]?.trim()
  if (arg) {
    await backfillWorkTemplateCategoriesForCompany(prisma, arg)
    console.log("Done for company", arg)
    return
  }
  const companies = await prisma.company.findMany({ select: { id: true, name: true } })
  for (const c of companies) {
    await backfillWorkTemplateCategoriesForCompany(prisma, c.id)
    console.log("OK:", c.name, c.id)
  }
  console.log("Completed", companies.length, "companies.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
