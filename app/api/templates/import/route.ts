import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import * as XLSX from "xlsx"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

const templateRowSchema = z.object({
  name: z.string().min(1),
  defaultDurationDays: z.union([z.number(), z.string()]).transform((val) => {
    const num = typeof val === "string" ? parseInt(val, 10) : val
    if (isNaN(num) || num < 1) throw new Error("Invalid duration")
    return num
  }),
  sortOrder: z.union([z.number(), z.string()]).transform((val) => {
    const num = typeof val === "string" ? parseInt(val, 10) : val
    if (isNaN(num) || num < 0) throw new Error("Invalid sort order")
    return num
  }),
  optionalCategory: z.string().optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { prisma } = await import("@/lib/prisma")
    const { requireTenantPermission } = await import("@/lib/rbac")
    const { createAuditLog } = await import("@/lib/audit")
    const ctx = await requireTenantPermission("templates:write")

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Read the file as buffer
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: "array" })

    // Get the first sheet
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // Convert to JSON - first try with headers, then without
    let data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1, // Use array format
      defval: null,
    })

    // Find header row (look for "name" or "Name" in first few rows)
    let headerRowIndex = -1
    const headerKeywords = ["name", "duration", "order", "category"]
    
    for (let i = 0; i < Math.min(3, data.length); i++) {
      const row = data[i] as any[]
      if (row && row.length > 0) {
        const firstCell = String(row[0] || "").toLowerCase()
        if (headerKeywords.some(keyword => firstCell.includes(keyword))) {
          headerRowIndex = i
          break
        }
      }
    }

    // Convert to object format
    let rows: any[] = []
    if (headerRowIndex >= 0) {
      // Use header row
      const headers = (data[headerRowIndex] as any[]).map((h: any) =>
        String(h || "").toLowerCase().trim()
      )
      const nameIndex = headers.findIndex((h) => h.includes("name"))
      const durationIndex = headers.findIndex((h) =>
        h.includes("duration") || h.includes("days")
      )
      const orderIndex = headers.findIndex((h) =>
        h.includes("order") || h.includes("sort")
      )
      const categoryIndex = headers.findIndex((h) => h.includes("category"))

      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[]
        if (!row || row.length === 0) continue

        const name = nameIndex >= 0 ? String(row[nameIndex] || "").trim() : ""
        if (!name) continue

        rows.push({
          name,
          defaultDurationDays:
            durationIndex >= 0 ? row[durationIndex] : null,
          sortOrder: orderIndex >= 0 ? row[orderIndex] : null,
          optionalCategory:
            categoryIndex >= 0 ? String(row[categoryIndex] || "").trim() : null,
        })
      }
    } else {
      // No header row, assume first 4 columns in order
      for (let i = 0; i < data.length; i++) {
        const row = data[i] as any[]
        if (!row || row.length === 0) continue

        const name = String(row[0] || "").trim()
        if (!name || name.toLowerCase() === "name") continue // Skip if looks like header

        rows.push({
          name,
          defaultDurationDays: row[1] || null,
          sortOrder: row[2] || null,
          optionalCategory: row[3] ? String(row[3]).trim() : null,
        })
      }
    }

    // Filter out empty rows
    rows = rows.filter((row: any) => row.name)

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found in Excel file" },
        { status: 400 }
      )
    }

    const results = {
      success: [] as any[],
      errors: [] as string[],
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any
      const rowNumber = i + 2 // +2 because we skip header and 0-indexed

      try {
        const validated = templateRowSchema.parse(row)

        // Check if template with same name exists in this company
        const existing = await prisma.workTemplateItem.findFirst({
          where: { name: validated.name, companyId: ctx.companyId },
        })

        if (existing) {
          results.errors.push(
            `Row ${rowNumber}: Template "${validated.name}" already exists`
          )
          continue
        }

        const template = await prisma.workTemplateItem.create({
          data: {
            companyId: ctx.companyId,
            name: validated.name,
            defaultDurationDays: validated.defaultDurationDays,
            sortOrder: validated.sortOrder,
            optionalCategory: validated.optionalCategory || null,
          },
        })

        results.success.push(template)
      } catch (error: any) {
        results.errors.push(
          `Row ${rowNumber}: ${error.message || "Invalid data"}`
        )
      }
    }

    // Create audit log
    if (results.success.length > 0) {
      await createAuditLog(
        ctx.userId,
        "WorkTemplateItem",
        "bulk",
        "BULK_CREATE",
        null,
        { count: results.success.length },
        ctx.companyId
      )
    }

    return NextResponse.json({
      success: true,
      imported: results.success.length,
      errors: results.errors,
      templates: results.success,
    })
  } catch (error: any) {
    console.error("Import error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to import templates" },
      { status: 500 }
    )
  }
}
