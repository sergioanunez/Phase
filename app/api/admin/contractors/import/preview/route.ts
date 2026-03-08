import { NextRequest, NextResponse } from "next/server"
import { isBuildTime, buildGuardResponse } from "@/lib/buildGuard"
import * as XLSX from "xlsx"
import {
  mapHeaders,
  parseAndValidateRow,
  markDuplicates,
  type RowValidation,
  type ParsedRow,
} from "@/lib/imports/contractorImport"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
export const fetchCache = "force-no-store"

function allowImportRole(role: string): boolean {
  return role === "Admin" || role === "Manager"
}

export async function POST(request: NextRequest) {
  try {
    if (isBuildTime) return buildGuardResponse()
    const { requireTenantContext } = await import("@/lib/tenant")
    const ctx = await requireTenantContext()
    if (!allowImportRole(ctx.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const name = (file.name || "").toLowerCase()
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      return NextResponse.json(
        { error: "File must be .xlsx or .csv" },
        { status: 400 }
      )
    }

    let data: unknown[][]
    if (name.endsWith(".csv")) {
      const text = await file.text()
      const workbook = XLSX.read(text, { type: "string", raw: true })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as unknown[][]
    } else {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as unknown[][]
    }

    if (!data?.length || !Array.isArray(data[0])) {
      return NextResponse.json(
        { error: "Invalid template format. Please download the template and try again." },
        { status: 400 }
      )
    }

    const headerRow = data[0] as string[]
    const map = mapHeaders(headerRow)
    if (!map) {
      return NextResponse.json(
        { error: "Invalid template format. Please download the template and try again." },
        { status: 400 }
      )
    }

    const validations: RowValidation[] = []
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown[]
      if (!row || (Array.isArray(row) && row.every((c) => c == null || String(c).trim() === ""))) continue
      validations.push(parseAndValidateRow(row, map, i))
    }

    const { prisma } = await import("@/lib/prisma")
    const existing = await prisma.contractor.findMany({
      where: { companyId: ctx.companyId, active: true },
      select: { phone: true, companyName: true },
    })
    const existingPhones = new Set(existing.map((c) => c.phone))
    const existingCompanyNamesLower = new Set(
      existing.map((c) => c.companyName.trim().toLowerCase())
    )

    const withDuplicates = markDuplicates(validations, existingPhones, existingCompanyNamesLower)

    const preview = withDuplicates.map((v) => {
      if (v.status === "Ready") {
        return {
          companyName: v.row.companyName,
          trade: v.row.trade,
          phone: v.row.phone,
          email: v.row.email,
          leadTimeDays: v.row.leadTimeDays,
          status: "Ready" as const,
          reason: null,
        }
      }
      if (v.status === "Duplicate") {
        return {
          companyName: v.row.companyName,
          trade: v.row.trade,
          phone: v.row.phone,
          email: v.row.email,
          leadTimeDays: v.row.leadTimeDays,
          status: "Duplicate" as const,
          reason: v.reason,
        }
      }
      return {
        companyName: (v.row.companyName ?? "").toString(),
        trade: (v.row.trade ?? "").toString(),
        phone: (v.row.phone ?? "").toString(),
        email: (v.row.email ?? null) as string | null,
        leadTimeDays: 0,
        status: "Invalid" as const,
        reason: v.reason,
      }
    })

    const ready = withDuplicates.filter((v) => v.status === "Ready").length
    const duplicate = withDuplicates.filter((v) => v.status === "Duplicate").length
    const invalid = withDuplicates.filter((v) => v.status === "Invalid").length

    return NextResponse.json({
      preview,
      summary: { ready, duplicate, invalid },
    })
  } catch (e: any) {
    console.error("Contractor import preview error:", e)
    return NextResponse.json(
      { error: e?.message ?? "Failed to preview import" },
      { status: 500 }
    )
  }
}
