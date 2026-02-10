import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const isBuild = () =>
  process.env.NEXT_PHASE === "phase-production-build" || (process.env.VERCEL === "1" && process.env.CI === "1")

export async function POST(request: NextRequest) {
  try {
    if (isBuild()) return NextResponse.json({ error: "Unavailable" }, { status: 503 })
    const { prisma } = await import("@/lib/prisma")
    const { requirePermission } = await import("@/lib/rbac")
    const user = await requirePermission("templates:write")

    // Find all template items with the typo "Prelliminary" in category
    const templatesWithTypo = await prisma.workTemplateItem.findMany({
      where: {
        optionalCategory: {
          not: null,
        },
      },
    })

    // Update all instances of "Prelliminary" to "Preliminary"
    let fixedCount = 0
    for (const template of templatesWithTypo) {
      if (template.optionalCategory && /Prelliminary/i.test(template.optionalCategory)) {
        const corrected = template.optionalCategory.replace(/Prelliminary/gi, "Preliminary")
        await prisma.workTemplateItem.update({
          where: { id: template.id },
          data: { optionalCategory: corrected },
        })
        fixedCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixedCount} template item(s) with typo "Prelliminary" → "Preliminary"`,
      fixedCount,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fix typo" },
      { status: 500 }
    )
  }
}
