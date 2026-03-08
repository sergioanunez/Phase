/**
 * Backfill companyId (and homeId if missing) on SmsMessage rows so they appear
 * in the home Activity feed. Run with: npx tsx scripts/backfill-sms-company-id.ts
 */
import { prisma } from "../lib/prisma"

async function main() {
  const withNullCompany = await prisma.smsMessage.findMany({
    where: { companyId: null },
    select: { id: true, homeTaskId: true, homeId: true },
  })

  if (withNullCompany.length === 0) {
    console.log("No SmsMessage rows with null companyId. Nothing to do.")
    return
  }

  let updated = 0
  let skipped = 0

  for (const sms of withNullCompany) {
    let companyId: string | null = null
    let homeId: string | null = sms.homeId

    if (sms.homeTaskId) {
      const task = await prisma.homeTask.findUnique({
        where: { id: sms.homeTaskId },
        select: { companyId: true, homeId: true },
      })
      if (task) {
        companyId = task.companyId
        if (!homeId) homeId = task.homeId
      }
    }

    if (!companyId && sms.homeId) {
      const home = await prisma.home.findUnique({
        where: { id: sms.homeId },
        select: { companyId: true },
      })
      if (home) companyId = home.companyId
    }

    if (!companyId) {
      skipped++
      continue
    }

    await prisma.smsMessage.update({
      where: { id: sms.id },
      data: {
        companyId,
        ...(homeId && !sms.homeId ? { homeId } : {}),
      },
    })
    updated++
  }

  console.log(`Backfill complete: ${updated} SmsMessage rows updated, ${skipped} skipped (no company found).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
