import { normalizePhone } from "./normalizePhone"

const COMPANY_HEADERS = [
  "company name",
  "company",
  "contractor",
  "contractor name",
  "name",
]
const TRADE_HEADERS = ["trade", "scope", "specialty"]
const PHONE_HEADERS = ["phone", "mobile", "cell", "phone number"]
const EMAIL_HEADERS = ["email", "email address"]
const LEAD_HEADERS = ["lead time days", "lead time", "lead days", "lead"]

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase())
  for (const c of candidates) {
    const i = normalized.findIndex((h) => h === c.trim().toLowerCase())
    if (i >= 0) return i
  }
  return -1
}

export type ColumnMap = {
  companyName: number
  trade: number
  phone: number
  email: number
  leadTimeDays: number
}

/**
 * Map header row (array of strings) to column indices.
 * Returns null if required columns cannot be mapped.
 */
export function mapHeaders(headerRow: string[]): ColumnMap | null {
  const headers = headerRow.map((h) => String(h ?? "").trim())
  const companyName = findColumnIndex(headers, COMPANY_HEADERS)
  const trade = findColumnIndex(headers, TRADE_HEADERS)
  const phone = findColumnIndex(headers, PHONE_HEADERS)
  if (companyName < 0 || trade < 0 || phone < 0) return null
  const email = findColumnIndex(headers, EMAIL_HEADERS)
  const leadTimeDays = findColumnIndex(headers, LEAD_HEADERS)
  return {
    companyName,
    trade,
    phone,
    email: email >= 0 ? email : -1,
    leadTimeDays: leadTimeDays >= 0 ? leadTimeDays : -1,
  }
}

function getCell(row: unknown[], index: number): string {
  if (index < 0 || !Array.isArray(row)) return ""
  const v = row[index]
  if (v == null) return ""
  return String(v).trim()
}

function basicEmailValid(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export type ParsedRow = {
  companyName: string
  trade: string
  phone: string
  phoneE164: string | null
  email: string | null
  leadTimeDays: number
}

export type RowValidation =
  | { status: "Ready"; row: ParsedRow }
  | { status: "Invalid"; reason: string; row: Partial<ParsedRow> }
  | { status: "Duplicate"; reason: string; row: ParsedRow }

/**
 * Parse and validate a single data row. Does not check duplicates (caller does).
 */
export function parseAndValidateRow(
  row: unknown[],
  map: ColumnMap,
  rowIndex: number
): RowValidation {
  const companyName = getCell(row, map.companyName)
  const trade = getCell(row, map.trade)
  const phoneRaw = getCell(row, map.phone)
  const emailRaw = map.email >= 0 ? getCell(row, map.email) : ""
  const leadRaw = map.leadTimeDays >= 0 ? getCell(row, map.leadTimeDays) : ""

  if (!companyName) {
    return { status: "Invalid", reason: "Missing company name", row: { companyName, trade, phone: phoneRaw } }
  }
  if (!trade) {
    return { status: "Invalid", reason: "Missing trade", row: { companyName, trade, phone: phoneRaw } }
  }
  if (!phoneRaw) {
    return { status: "Invalid", reason: "Missing phone", row: { companyName, trade, phone: phoneRaw } }
  }

  const phoneE164 = normalizePhone(phoneRaw)
  if (!phoneE164) {
    return { status: "Invalid", reason: "Invalid phone", row: { companyName, trade, phone: phoneRaw } }
  }

  if (emailRaw && !basicEmailValid(emailRaw)) {
    return {
      status: "Invalid",
      reason: "Invalid email",
      row: { companyName, trade, phone: phoneRaw, email: emailRaw },
    }
  }

  let leadTimeDays = 0
  if (leadRaw) {
    const n = parseInt(leadRaw, 10)
    if (isNaN(n) || n < 0) {
      return {
        status: "Invalid",
        reason: "Lead time must be ≥ 0",
        row: { companyName, trade, phone: phoneRaw, email: emailRaw || null },
      }
    }
    leadTimeDays = n
  }

  const parsed: ParsedRow = {
    companyName,
    trade,
    phone: phoneE164,
    phoneE164,
    email: emailRaw || null,
    leadTimeDays,
  }
  return { status: "Ready", row: parsed }
}

/**
 * Mark rows as Duplicate when same normalized phone or same company name (case-insensitive) exists in existing set or in earlier rows.
 */
export function markDuplicates(
  validations: RowValidation[],
  existingPhones: Set<string>,
  existingCompanyNamesLower: Set<string>
): RowValidation[] {
  const seenPhones = new Set(existingPhones)
  const seenCompanyNames = new Set(existingCompanyNamesLower)

  return validations.map((v) => {
    if (v.status !== "Ready") return v
    const { row } = v
    const phoneKey = row.phoneE164 ?? row.phone
    const companyLower = row.companyName.trim().toLowerCase()
    if (seenPhones.has(phoneKey)) {
      return { status: "Duplicate", reason: "Duplicate phone", row }
    }
    if (seenCompanyNames.has(companyLower)) {
      return { status: "Duplicate", reason: "Duplicate company name", row }
    }
    seenPhones.add(phoneKey)
    seenCompanyNames.add(companyLower)
    return v
  })
}
