import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/rbac"

export async function POST(request: NextRequest) {
  try {
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
