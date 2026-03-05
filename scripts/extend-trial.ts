/**
 * Extend a company's trial by a number of days (from today).
 * Use when trial has already expired and the tenant needs immediate access.
 *
 * Usage: npx tsx scripts/extend-trial.ts <slug> <days>
 * Example: npx tsx scripts/extend-trial.ts cullers 7
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const slug = process.argv[2]
  const daysArg = process.argv[3]
  if (!slug || !daysArg) {
    console.error("Usage: npx tsx scripts/extend-trial.ts <company-slug> <days>")
    console.error('Example: npx tsx scripts/extend-trial.ts cullers 7')
    process.exit(1)
  }
  const days = parseInt(daysArg, 10)
  if (Number.isNaN(days) || days < 1) {
    console.error("Days must be a positive integer.")
    process.exit(1)
  }

  const company = await prisma.company.findFirst({
    where: { slug },
    select: { id: true, name: true, trialEndsAt: true },
  })
  if (!company) {
    console.error(`Company not found for slug: ${slug}`)
    process.exit(1)
  }

  const now = new Date()
  const newTrialEndsAt = new Date(now)
  newTrialEndsAt.setDate(newTrialEndsAt.getDate() + days)

  await prisma.company.update({
    where: { id: company.id },
    data: {
      trialEndsAt: newTrialEndsAt,
      lastTrialResetAt: now,
      trialResetCount: { increment: 1 },
    },
  })

  console.log(`Extended trial for ${company.name} (${slug}).`)
  console.log(`  Previous trial end: ${company.trialEndsAt?.toISOString() ?? "none"}`)
  console.log(`  New trial end:       ${newTrialEndsAt.toISOString()} (${days} days from now)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
