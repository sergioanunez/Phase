import { PrismaClient, GateScope, GateBlockMode } from "@prisma/client"
import bcrypt from "bcryptjs"

// Force seed to use DATABASE_URL (pooler) only, so it never uses DIRECT_URL (5432) which may be unreachable.
const databaseUrl = process.env.DATABASE_URL
const prisma = new PrismaClient(
  databaseUrl
    ? { datasources: { db: { url: databaseUrl } } }
    : undefined
)

const DEFAULT_TENANT_SLUG = "cullers"
const DEFAULT_TENANT_NAME = "Cullers Homes"
const DEFAULT_ALLOWED_EMAIL_DOMAINS = ["cullers.com"]
const ADMIN_EMAIL = "admin@cullers.com"

async function main() {
  console.log("Seeding database...")
  if (databaseUrl) {
    try {
      const u = new URL(databaseUrl)
      const port = u.port || "5432"
      console.log("Using DATABASE_URL host:", u.hostname, "port:", port)
      if (port === "5432" && u.hostname.includes("supabase.co") && !u.hostname.includes("pooler")) {
        console.error("\nERROR: DATABASE_URL is set to the direct Supabase URL (port 5432), which is often unreachable from your network.")
        console.error("In your .env file, set DATABASE_URL to the Supabase POOLER URL (port 6543) instead.")
        console.error("In Supabase Dashboard: Connect → Connection string → Transaction pooler → copy that URI and add ?sslmode=require&pgbouncer=true")
        process.exit(1)
      }
    } catch {
      // ignore
    }
  }

  // Idempotent: upsert default tenant (Company) by slug, or by name for existing DBs without slug
  let company = await prisma.company.findUnique({
    where: { slug: DEFAULT_TENANT_SLUG },
  })
  if (!company) {
    company = await prisma.company.findFirst({
      where: { name: DEFAULT_TENANT_NAME },
    })
    if (company) {
      company = await prisma.company.update({
        where: { id: company.id },
        data: { slug: DEFAULT_TENANT_SLUG, allowedEmailDomains: DEFAULT_ALLOWED_EMAIL_DOMAINS },
      })
    } else {
      company = await prisma.company.create({
        data: {
          name: DEFAULT_TENANT_NAME,
          slug: DEFAULT_TENANT_SLUG,
          allowedEmailDomains: DEFAULT_ALLOWED_EMAIL_DOMAINS,
          pricingTier: "SMALL",
          maxActiveHomes: null,
          status: "ACTIVE",
        },
      })
    }
  } else {
    company = await prisma.company.update({
      where: { id: company.id },
      data: { name: DEFAULT_TENANT_NAME, allowedEmailDomains: DEFAULT_ALLOWED_EMAIL_DOMAINS },
    })
  }
  const companyId = company.id
  console.log("Upserted tenant:", company.name, "slug:", company.slug)

  // Idempotent: upsert default admin user by email
  const adminPassword = await bcrypt.hash("admin123", 10)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      companyId,
      name: "Admin User",
      email: ADMIN_EMAIL,
      passwordHash: adminPassword,
      role: "Admin",
      isActive: true,
    },
    update: {
      companyId,
      name: "Admin User",
      passwordHash: adminPassword,
      role: "Admin",
      isActive: true,
    },
  })
  console.log("Upserted admin user:", admin.email)

  // Always upsert Super Admin (platform user, no company) so it exists even when demo data is skipped
  const superAdminPassword = await bcrypt.hash("superadmin123", 10)
  await prisma.user.upsert({
    where: { email: "superadmin@usephase.app" },
    create: {
      name: "Super Admin",
      email: "superadmin@usephase.app",
      passwordHash: superAdminPassword,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      companyId: null,
      isActive: true,
    },
    update: {
      passwordHash: superAdminPassword,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      isActive: true,
    },
  })
  console.log("Upserted super admin: superadmin@usephase.app")

  // Optional: bootstrap full demo data only if this tenant has no subdivisions yet
  const existingSubdivisions = await prisma.subdivision.count({
    where: { companyId },
  })
  if (existingSubdivisions > 0) {
    console.log("Demo data already present for tenant; skipping full seed.")
    console.log("\nTest accounts (if already created):")
    console.log("Admin:", ADMIN_EMAIL, "/ admin123")
    console.log("Super admin: superadmin@usephase.app / superadmin123")
    console.log("Superintendent: super@cullers.com / super123")
    console.log("Manager: manager@cullers.com / manager123")
    console.log("Subcontractor: sub@cullers.com / sub123")
    return
  }

  // Create Subdivisions
  const subdivision1 = await prisma.subdivision.create({
    data: {
      companyId,
      name: "Oakwood Estates",
    },
  })

  const subdivision2 = await prisma.subdivision.create({
    data: {
      companyId,
      name: "Riverside Heights",
    },
  })

  console.log("Created subdivisions")

  // Create Contractors (scoped to default tenant)
  const contractor1 = await prisma.contractor.create({
    data: {
      companyId,
      companyName: "ABC Plumbing",
      contactName: "John Smith",
      phone: "+15551234567",
      email: "john@abcplumbing.com",
      trade: "Plumbing",
      active: true,
      preferredNoticeDays: 3,
    },
  })

  const contractor2 = await prisma.contractor.create({
    data: {
      companyId,
      companyName: "XYZ Electrical",
      contactName: "Jane Doe",
      phone: "+15559876543",
      email: "jane@xyzelectrical.com",
      trade: "Electrical",
      active: true,
      preferredNoticeDays: 2,
    },
  })

  const contractor3 = await prisma.contractor.create({
    data: {
      companyId,
      companyName: "Best Roofing",
      contactName: "Bob Johnson",
      phone: "+15555555555",
      email: "bob@bestroofing.com",
      trade: "Roofing",
      active: true,
      preferredNoticeDays: 5,
    },
  })

  console.log("Created contractors")

  // Create or update remaining Users (idempotent; admin already upserted above)
  const superPassword = await bcrypt.hash("super123", 10)
  const superintendent = await prisma.user.upsert({
    where: { email: "super@cullers.com" },
    create: {
      companyId,
      name: "Superintendent User",
      email: "super@cullers.com",
      passwordHash: superPassword,
      role: "Superintendent",
      isActive: true,
    },
    update: { companyId, name: "Superintendent User", passwordHash: superPassword, role: "Superintendent", isActive: true },
  })

  const managerPassword = await bcrypt.hash("manager123", 10)
  const manager = await prisma.user.upsert({
    where: { email: "manager@cullers.com" },
    create: {
      companyId,
      name: "Manager User",
      email: "manager@cullers.com",
      passwordHash: managerPassword,
      role: "Manager",
      isActive: true,
    },
    update: { companyId, name: "Manager User", passwordHash: managerPassword, role: "Manager", isActive: true },
  })

  const subcontractorPassword = await bcrypt.hash("sub123", 10)
  const subcontractor = await prisma.user.upsert({
    where: { email: "sub@cullers.com" },
    create: {
      companyId,
      name: "Subcontractor User",
      email: "sub@cullers.com",
      passwordHash: subcontractorPassword,
      role: "Subcontractor",
      contractorId: contractor1.id,
      isActive: true,
    },
    update: { companyId, name: "Subcontractor User", passwordHash: subcontractorPassword, role: "Subcontractor", contractorId: contractor1.id, isActive: true },
  })

  console.log("Created users")

  // Create Work Template Items
  const templateItems = [
    { name: "Foundation", defaultDurationDays: 7, sortOrder: 1 },
    { name: "Framing", defaultDurationDays: 14, sortOrder: 2 },
    { name: "Structural Walkthrough", defaultDurationDays: 1, sortOrder: 3, isCriticalGate: true, gateName: "Structural Walkthrough", gateScope: "DownstreamOnly", gateBlockMode: "ScheduleOnly" },
    { name: "Roofing", defaultDurationDays: 5, sortOrder: 4 },
    { name: "Plumbing Rough-In", defaultDurationDays: 3, sortOrder: 5 },
    { name: "Electrical Rough-In", defaultDurationDays: 3, sortOrder: 6 },
    { name: "HVAC Installation", defaultDurationDays: 4, sortOrder: 7 },
    { name: "Drywall", defaultDurationDays: 7, sortOrder: 8 },
    { name: "Paint", defaultDurationDays: 5, sortOrder: 9 },
    { name: "Flooring", defaultDurationDays: 4, sortOrder: 10 },
    { name: "Final Inspection", defaultDurationDays: 1, sortOrder: 11 },
  ]

  const createdTemplates = []
  for (const item of templateItems) {
    const template = await prisma.workTemplateItem.create({
      data: {
        companyId,
        name: item.name,
        defaultDurationDays: item.defaultDurationDays,
        sortOrder: item.sortOrder,
        isCriticalGate: item.isCriticalGate || false,
        gateName: item.gateName || null,
        gateScope: (item.gateScope as GateScope) ?? GateScope.DownstreamOnly,
        gateBlockMode: (item.gateBlockMode as GateBlockMode) ?? GateBlockMode.ScheduleOnly,
      },
    })
    createdTemplates.push(template)
  }

  console.log("Created template items")

  // Create Homes
  const home1 = await prisma.home.create({
    data: {
      companyId,
      subdivisionId: subdivision1.id,
      addressOrLot: "123 Oakwood Drive",
      targetCompletionDate: new Date("2024-12-31"),
    },
  })

  const home2 = await prisma.home.create({
    data: {
      companyId,
      subdivisionId: subdivision1.id,
      addressOrLot: "125 Oakwood Drive",
      targetCompletionDate: new Date("2025-01-15"),
    },
  })

  const home3 = await prisma.home.create({
    data: {
      companyId,
      subdivisionId: subdivision2.id,
      addressOrLot: "456 Riverside Blvd",
      targetCompletionDate: new Date("2025-02-01"),
    },
  })

  console.log("Created homes")

  // Create Home Assignments
  await prisma.homeAssignment.create({
    data: {
      companyId,
      homeId: home1.id,
      superintendentUserId: superintendent.id,
    },
  })

  await prisma.homeAssignment.create({
    data: {
      companyId,
      homeId: home2.id,
      superintendentUserId: superintendent.id,
    },
  })

  await prisma.homeAssignment.create({
    data: {
      companyId,
      homeId: home3.id,
      superintendentUserId: superintendent.id,
    },
  })

  console.log("Created home assignments")

  // Create Home Tasks for each home
  for (const home of [home1, home2, home3]) {
    for (const template of createdTemplates) {
      await prisma.homeTask.create({
        data: {
          homeId: home.id,
          templateItemId: template.id,
          nameSnapshot: template.name,
          durationDaysSnapshot: template.defaultDurationDays,
          sortOrderSnapshot: template.sortOrder,
          status: "Unscheduled",
        },
      })
    }
  }

  console.log("Created home tasks")

  // Schedule some tasks for home1
  const home1Tasks = await prisma.homeTask.findMany({
    where: { homeId: home1.id },
    orderBy: { sortOrderSnapshot: "asc" },
  })

  if (home1Tasks.length >= 3) {
    // Schedule first task
    await prisma.homeTask.update({
      where: { id: home1Tasks[0].id },
      data: {
        status: "Confirmed",
        scheduledDate: new Date(),
        contractorId: contractor1.id,
      },
    })

    // Schedule second task
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    await prisma.homeTask.update({
      where: { id: home1Tasks[1].id },
      data: {
        status: "PendingConfirm",
        scheduledDate: tomorrow,
        contractorId: contractor2.id,
        lastConfirmationAt: new Date(),
      },
    })

    // Complete third task
    await prisma.homeTask.update({
      where: { id: home1Tasks[2].id },
      data: {
        status: "Completed",
        scheduledDate: new Date(Date.now() - 86400000), // Yesterday
        contractorId: contractor3.id,
        completedAt: new Date(),
      },
    })
  }

  console.log("Scheduled sample tasks")

  // Contractor assignments so subcontractor can see assigned homes (my-week, home detail)
  await prisma.contractorAssignment.create({
    data: { companyId, contractorId: contractor1.id, homeId: home1.id },
  })
  await prisma.contractorAssignment.create({
    data: { companyId, contractorId: contractor2.id, homeId: home1.id },
  })
  await prisma.contractorAssignment.create({
    data: { companyId, contractorId: contractor3.id, homeId: home1.id },
  })
  console.log("Created contractor assignments")

  // Create sample punch items for the Structural Walkthrough gate on home1
  const structuralWalkthroughTemplate = createdTemplates.find(
    (t) => t.name === "Structural Walkthrough"
  )
  if (structuralWalkthroughTemplate) {
    const structuralTask = await prisma.homeTask.findFirst({
      where: {
        homeId: home1.id,
        templateItemId: structuralWalkthroughTemplate.id,
      },
    })

    if (structuralTask) {
      const punchItem = await prisma.punchItem.create({
        data: {
          companyId,
          homeId: home1.id,
          relatedHomeTaskId: structuralTask.id,
          createdByUserId: superintendent.id,
          assignedContractorId: contractor1.id,
          category: "Structural",
          severity: "Major",
          title: "Foundation crack inspection needed",
          description: "Minor crack observed in foundation wall. Requires structural engineer review.",
          status: "Open",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })

      // Update task punch counts
      await prisma.homeTask.update({
        where: { id: structuralTask.id },
        data: {
          hasOpenPunch: true,
          punchOpenCount: 1,
        },
      })

      console.log("Created sample punch item for gate demonstration")
    }
  }

  // Sample notifications for builder testing (tenant-level only; no SUPER_ADMIN)
  await prisma.notification.create({
    data: {
      companyId,
      severity: "ATTENTION",
      category: "SCHEDULE",
      title: "Task scheduled for tomorrow",
      message: "Framing at 123 Oakwood Drive is scheduled for tomorrow.",
      entityType: "TASK",
      entityId: home1Tasks.length >= 2 ? home1Tasks[1].id : null,
      homeId: home1.id,
      createdByUserId: admin.id,
      targetRole: "ANY",
      requiresAction: false,
      createdAt: new Date(),
    },
  })
  await prisma.notification.create({
    data: {
      companyId,
      severity: "INFO",
      category: "QUALITY",
      title: "Punch item added",
      message: "A punch item was added to Structural Walkthrough at 123 Oakwood Drive.",
      entityType: "PUNCH",
      entityId: null,
      homeId: home1.id,
      targetRole: "SUPERINTENDENT",
      requiresAction: false,
      createdAt: new Date(),
    },
  })
  console.log("Created sample notifications for builder testing")

  console.log("Seeding completed!")
  console.log("\nTest accounts:")
  console.log("Admin: admin@cullers.com / admin123")
  console.log("Superintendent: super@cullers.com / super123")
  console.log("Manager: manager@cullers.com / manager123")
  console.log("Subcontractor: sub@cullers.com / sub123")
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
