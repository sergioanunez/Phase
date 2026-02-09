import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Fixing 'Prelliminary' typo in database...")

  // Find all template items with the typo
  const templatesWithTypo = await prisma.workTemplateItem.findMany({
    where: {
      optionalCategory: {
        not: null,
      },
    },
  })

  let fixedCount = 0
  for (const template of templatesWithTypo) {
    if (template.optionalCategory && /Prelliminary/i.test(template.optionalCategory)) {
      const corrected = template.optionalCategory.replace(/Prelliminary/gi, "Preliminary")
      await prisma.workTemplateItem.update({
        where: { id: template.id },
        data: { optionalCategory: corrected },
      })
      console.log(
        `Fixed: "${template.optionalCategory}" → "${corrected}" (Template: ${template.name})`
      )
      fixedCount++
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} template item(s)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
