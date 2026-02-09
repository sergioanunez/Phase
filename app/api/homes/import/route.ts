import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/rbac"
import { createAuditLog } from "@/lib/audit"
import * as XLSX from "xlsx"
import { z } from "zod"

const homeRowSchema = z.object({
  addressOrLot: z.string().min(1),
  targetCompletionDate: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val === "" || val === null) return null
      // Try to parse as date
      if (typeof val === "number") {
        // Excel date serial number
        const date = XLSX.SSF.parse_date_code(val)
        if (date) {
          return new Date(date.y, date.m - 1, date.d).toISOString().split("T")[0]
        }
        return null
      }
      const str = String(val).trim()
      if (!str) return null
      // Try to parse various date formats
      const date = new Date(str)
      if (isNaN(date.getTime())) return null
      return date.toISOString().split("T")[0]
    }),
})

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("homes:write")

    const formData = await request.formData()
    const file = formData.get("file") as File
    const subdivisionId = formData.get("subdivisionId") as string

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    if (!subdivisionId) {
      return NextResponse.json(
        { error: "Subdivision ID is required" },
        { status: 400 }
      )
    }

    // Verify subdivision exists
    const subdivision = await prisma.subdivision.findUnique({
      where: { id: subdivisionId },
    })

    if (!subdivision) {
      return NextResponse.json(
        { error: "Subdivision not found" },
        { status: 404 }
      )
    }

    // Read the file as buffer
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: "array" })

    // Get the first sheet
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // Convert to JSON
    let data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
    })

    // Find header row
    let headerRowIndex = -1
    const headerKeywords = ["address", "lot", "completion", "date"]

    for (let i = 0; i < Math.min(3, data.length); i++) {
      const row = data[i] as any[]
      if (row && row.length > 0) {
        const firstCell = String(row[0] || "").toLowerCase()
        if (headerKeywords.some((keyword) => firstCell.includes(keyword))) {
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
      const addressIndex = headers.findIndex(
        (h) => h.includes("address") || h.includes("lot")
      )
      const dateIndex = headers.findIndex(
        (h) => h.includes("completion") || h.includes("date") || h.includes("target")
      )

      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[]
        if (!row || row.length === 0) continue

        const addressOrLot =
          addressIndex >= 0 ? String(row[addressIndex] || "").trim() : ""
        if (!addressOrLot) continue

        rows.push({
          addressOrLot,
          targetCompletionDate:
            dateIndex >= 0 ? row[dateIndex] : null,
        })
      }
    } else {
      // No header, assume first column is address, second is date (optional)
      for (let i = 0; i < data.length; i++) {
        const row = data[i] as any[]
        if (!row || row.length === 0) continue

        const addressOrLot = String(row[0] || "").trim()
        if (!addressOrLot || addressOrLot.toLowerCase() === "address" || addressOrLot.toLowerCase() === "lot") continue

        rows.push({
          addressOrLot,
          targetCompletionDate: row[1] || null,
        })
      }
    }

    // Filter out empty rows
    rows = rows.filter((row: any) => row.addressOrLot)

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

    // Get template items to create tasks for each home
    const templateItems = await prisma.workTemplateItem.findMany({
      orderBy: { sortOrder: "asc" },
    })

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNumber = headerRowIndex >= 0 ? i + headerRowIndex + 2 : i + 2

      try {
        const validated = homeRowSchema.parse(row)

        // Check if home with same address already exists in this subdivision
        const existing = await prisma.home.findFirst({
          where: {
            subdivisionId,
            addressOrLot: validated.addressOrLot,
          },
        })

        if (existing) {
          results.errors.push(
            `Row ${rowNumber}: Home "${validated.addressOrLot}" already exists in this subdivision`
          )
          continue
        }

        // Create home
        const home = await prisma.home.create({
          data: {
            subdivisionId,
            addressOrLot: validated.addressOrLot,
            targetCompletionDate: validated.targetCompletionDate
              ? new Date(validated.targetCompletionDate)
              : null,
          },
        })

        // Create tasks from template
        const tasks = await Promise.all(
          templateItems.map((item) =>
            prisma.homeTask.create({
              data: {
                homeId: home.id,
                templateItemId: item.id,
                nameSnapshot: item.name,
                durationDaysSnapshot: item.defaultDurationDays,
                sortOrderSnapshot: item.sortOrder,
                status: "Unscheduled",
              },
            })
          )
        )

        await createAuditLog(
          user.id,
          "Home",
          home.id,
          "CREATE",
          null,
          home
        )

        results.success.push(home)
      } catch (error: any) {
        results.errors.push(
          `Row ${rowNumber}: ${error.message || "Invalid data"}`
        )
      }
    }

    return NextResponse.json({
      success: true,
      imported: results.success.length,
      errors: results.errors,
      homes: results.success,
    })
  } catch (error: any) {
    console.error("Import error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to import homes" },
      { status: 500 }
    )
  }
}
