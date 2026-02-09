/**
 * Create or fix the Platform Admin user so you can log in to the Builders (master admin) panel.
 *
 * Usage: npx tsx scripts/ensure-platform-admin.ts
 *
 * Credentials after running: platform@buildflow.com / platform123
 */

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const EMAIL = "platform@buildflow.com"
const PASSWORD = "platform123"
const NAME = "Platform Admin"

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
  })

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: "PlatformAdmin",
        status: "ACTIVE",
        companyId: null,
        isActive: true,
        name: NAME,
      },
    })
    console.log("Updated Platform Admin user:", EMAIL)
  } else {
    await prisma.user.create({
      data: {
        name: NAME,
        email: EMAIL,
        passwordHash,
        role: "PlatformAdmin",
        status: "ACTIVE",
        companyId: null,
        isActive: true,
      },
    })
    console.log("Created Platform Admin user:", EMAIL)
  }

  console.log("You can now sign in with:", EMAIL, "/", PASSWORD)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
