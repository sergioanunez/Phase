/**
 * Reassign WorkTemplateItem.sequenceOrder from the canonical admin execution flatten
 * (category stack + per-category sort). Use after imports or bad data left random sequenceOrder.
 *
 * Usage:
 *   npx tsx scripts/normalize-work-template-sequence-order.ts              # all companies
 *   npx tsx scripts/normalize-work-template-sequence-order.ts <companyId>
 */
import { PrismaClient } from "@prisma/client"
import { flattenWorkTemplatesForAdminExecutionOrder } from "../lib/work-template-display-order"

const prisma = new PrismaClient()

const START = 100
const STEP = 100

async function normalizeCompany(companyId: string) {
  const items = await prisma.workTemplateItem.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      sequenceOrder: true,
      optionalCategory: true,
      createdAt: true,
    },
  })
  if (items.length === 0) {
    console.log(`[skip] ${companyId}: no templates`)
    return
  }
  const flat = flattenWorkTemplatesForAdminExecutionOrder(items)
  const positions = flat.map((_, i) => START + i * STEP)
  const posUniq = new Set(positions)
  if (posUniq.size !== positions.length) {
    console.error(`[error] ${companyId}: duplicate positions computed`)
    process.exitCode = 1
    return
  }
  await prisma.$transaction(
    flat.map((t, index) =>
      prisma.workTemplateItem.update({
        where: { id: t.id },
        data: { sequenceOrder: START + index * STEP },
      })
    )
  )
  console.log(`[ok] ${companyId}: ${flat.length} items → sequenceOrder ${START}…${START + (flat.length - 1) * STEP}`)
}

async function main() {
  const arg = process.argv[2]?.trim()
  if (arg) {
    await normalizeCompany(arg)
    return
  }
  const companies = await prisma.company.findMany({ select: { id: true, name: true } })
  for (const c of companies) {
    await normalizeCompany(c.id)
  }
  console.log(`Done. ${companies.length} tenant(s) processed.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
