/**
 * Interpretation layer: map user text to structured intents.
 * Pattern matching only; no autonomous behavior.
 */

import type {
  ReadIntent,
  ExecuteIntent,
  ParsedIntent,
  ScheduleTaskIntent,
  CreatePunchlistIntent,
  CreateMaterialRequestIntent,
} from "./types"

const LOWER = (s: string) => s.toLowerCase().trim()

/** Match schedule task patterns like "Schedule drywall for 652 Paseo next Tuesday" */
const SCHEDULE_PATTERNS = [
  /schedule\s+(.+?)\s+for\s+(.+?)\s+(?:on\s+|next\s+|this\s+)?(\w+\s+\w+|\w+\s+\d{1,2}|tomorrow|next\s+\w+)/i,
  /schedule\s+(.+?)\s+for\s+(.+)/i,
  /(?:schedule|set)\s+(.+?)\s+at\s+(.+?)\s+(?:on\s+|for\s+)?(.+)/i,
]

/** Match punchlist: "Create a punchlist for 14409 Raywood with drywall touchup and cabinet adjustment" */
const PUNCHLIST_PATTERNS = [
  /create\s+(?:a\s+)?punchlist\s+for\s+(.+?)\s+with\s+(.+)/i,
  /create\s+(?:a\s+)?punchlist\s+for\s+(.+)/i,
  /punchlist\s+for\s+(.+?)\s+with\s+(.+)/i,
]

/** Match material request: "Order drywall for 652 Paseo", "What materials should be ordered this week" */
const MATERIAL_PATTERNS = [
  /order\s+(.+?)\s+for\s+(.+)/i,
  /(?:order|request)\s+(.+)/i,
]

function extractAddressFragment(text: string): string | undefined {
  const m = text.match(/\d+\s+[\w\s]+(?:Street|St|Ave|Avenue|Blvd|Lane|Ln|Dr|Way|Road|Rd|Paseo|Raywood|Wedgewood|Reina)/gi)
  if (m && m[0]) return m[0].trim()
  const num = text.match(/\d+\s+[\w\s]{3,40}/)
  return num ? num[0].trim() : undefined
}

function parseScheduleTask(input: string): ScheduleTaskIntent | null {
  const t = input.trim()
  for (const re of SCHEDULE_PATTERNS) {
    const m = t.match(re)
    if (m) {
      const taskName = m[1].trim()
      const rest = m[2]?.trim() ?? ""
      const datePart = m[3]?.trim()
      const addressFragment = extractAddressFragment(rest) ?? rest
      return {
        action: "schedule_task",
        homeAddressFragment: addressFragment,
        taskNameFragment: taskName,
        dateFragment: datePart ?? "",
        contractorFragment: undefined,
      }
    }
  }
  if (/schedule\s+.+for\s+.+/i.test(t)) {
    const forIdx = t.toLowerCase().indexOf(" for ")
    const before = t.slice(0, forIdx).replace(/^schedule\s+/i, "").trim()
    const after = t.slice(forIdx + 5).trim()
    const addressFragment = extractAddressFragment(after) ?? after
    const taskName = before
    const dateMatch = t.match(/(?:next\s+)?(?:on\s+)?(\w+\s+\d{1,2}|\w+\s+\w+|tomorrow)/i)
    return {
      action: "schedule_task",
      homeAddressFragment: addressFragment,
      taskNameFragment: taskName,
      dateFragment: dateMatch ? dateMatch[1] : "",
      contractorFragment: undefined,
    }
  }
  return null
}

function parsePunchlist(input: string): CreatePunchlistIntent | null {
  const t = input.trim()
  for (const re of PUNCHLIST_PATTERNS) {
    const m = t.match(re)
    if (m) {
      const addressFragment = (m[1] ?? "").trim()
      const itemsStr = m[2]?.trim() ?? ""
      const items = itemsStr
        ? itemsStr.split(/\s*,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean)
        : []
      return {
        action: "create_punchlist",
        homeAddressFragment: addressFragment,
        items,
        dueDateFragment: undefined,
        tradeFragment: undefined,
      }
    }
  }
  if (/create\s+(?:a\s+)?punchlist/i.test(t)) {
    const forMatch = t.match(/for\s+(.+?)(?:\s+with\s+|\s*$)/i)
    const withMatch = t.match(/with\s+(.+)/i)
    const addressFragment = forMatch ? forMatch[1].trim() : ""
    const itemsStr = withMatch ? withMatch[1].trim() : ""
    const items = itemsStr
      ? itemsStr.split(/\s*,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean)
      : []
    return {
      action: "create_punchlist",
      homeAddressFragment: addressFragment,
      items,
      dueDateFragment: undefined,
      tradeFragment: undefined,
    }
  }
  return null
}

function parseMaterialRequest(input: string): CreateMaterialRequestIntent | null {
  const t = input.trim()
  for (const re of MATERIAL_PATTERNS) {
    const m = t.match(re)
    if (m) {
      const material = m[1]?.trim() ?? ""
      const forPart = m[2]?.trim()
      const homeAddressFragment = forPart ? (extractAddressFragment(forPart) ?? forPart) : undefined
      return {
        action: "create_material_request",
        homeAddressFragment,
        materialFragment: material,
        quantityFragment: undefined,
        neededByFragment: undefined,
      }
    }
  }
  return null
}

function parseReadIntent(input: string): ReadIntent {
  const lower = LOWER(input)
  if (
    lower.includes("what needs attention") ||
    lower.includes("needs attention today") ||
    lower.includes("attention today")
  )
    return { type: "needs_attention" }
  if (
    lower.includes("schedule upcoming") ||
    lower.includes("upcoming tasks") ||
    lower.includes("schedule upcoming tasks")
  )
    return { type: "schedule_upcoming" }
  if (
    lower.includes("homes behind") ||
    lower.includes("behind schedule") ||
    lower.includes("what homes are behind")
  )
    return { type: "homes_behind" }
  if (lower.includes("why is") && (lower.includes("behind") || lower.includes("delayed")))
    return {
      type: "why_delayed",
      addressFragment: extractAddressFragment(input),
    }
  if (
    lower.includes("homes finishing") ||
    lower.includes("finishing this month") ||
    lower.includes("completing this month")
  )
    return { type: "homes_finishing_month" }
  if (
    lower.includes("materials") &&
    (lower.includes("order") || lower.includes("ordered") || lower.includes("this week"))
  )
    return { type: "materials_this_week" }
  if (lower.includes("create a punchlist") && !parsePunchlist(input))
    return { type: "create_punchlist_help" }
  return { type: "unknown", raw: input }
}

/**
 * Parse user message into a single structured intent.
 * EXECUTE intents take precedence when patterns match; otherwise READ/RECOMMEND.
 */
export function parseIntent(message: string): ParsedIntent {
  const trimmed = message.trim()
  if (!trimmed) {
    return { kind: "READ", read: { type: "unknown", raw: "" } }
  }

  const schedule = parseScheduleTask(trimmed)
  if (schedule) return { kind: "EXECUTE", execute: schedule }

  const punchlist = parsePunchlist(trimmed)
  if (punchlist) return { kind: "EXECUTE", execute: punchlist }

  const material = parseMaterialRequest(trimmed)
  if (material) return { kind: "EXECUTE", execute: material }

  const read = parseReadIntent(trimmed)
  const isRecommend =
    /recommend|suggest|should i|what should|advise/i.test(trimmed) &&
    read.type !== "unknown"
  return isRecommend
    ? { kind: "RECOMMEND", read }
    : { kind: "READ", read }
}
