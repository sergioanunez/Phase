/**
 * Phase Assistant — deterministic construction copilot.
 * Two layers: Interpretation (text → intent) and Execution (approved actions only).
 */

export type IntentKind = "READ" | "RECOMMEND" | "EXECUTE"

/** READ: answer questions about schedule, status, attention */
export type ReadIntent =
  | { type: "needs_attention" }
  | { type: "schedule_upcoming" }
  | { type: "homes_behind" }
  | { type: "why_delayed"; addressFragment?: string }
  | { type: "homes_finishing_month" }
  | { type: "materials_this_week" }
  | { type: "create_punchlist_help" }
  | { type: "unknown"; raw: string }

/** EXECUTE: structured action payloads (require approval before execution) */
export type ScheduleTaskIntent = {
  action: "schedule_task"
  homeAddressFragment: string
  taskNameFragment: string
  dateFragment: string
  contractorFragment?: string
}

export type CreatePunchlistIntent = {
  action: "create_punchlist"
  homeAddressFragment: string
  items: string[]
  dueDateFragment?: string
  tradeFragment?: string
}

export type CreateMaterialRequestIntent = {
  action: "create_material_request"
  homeAddressFragment?: string
  materialFragment: string
  quantityFragment?: string
  neededByFragment?: string
}

export type ExecuteIntent =
  | ScheduleTaskIntent
  | CreatePunchlistIntent
  | CreateMaterialRequestIntent

export type ParsedIntent =
  | { kind: "READ"; read: ReadIntent }
  | { kind: "RECOMMEND"; read: ReadIntent }
  | { kind: "EXECUTE"; execute: ExecuteIntent }

/** Response from interpretation: either answer data or preview for approval */
export type AssistantInterpretResult =
  | {
      kind: "READ" | "RECOMMEND"
      message: string
      data?: Record<string, unknown>
    }
  | {
      kind: "EXECUTE"
      action: string
      message: string
      preview: ExecutePreviewPayload
    }

export type ExecutePreviewPayload =
  | ScheduleTaskPreview
  | PunchlistPreview
  | MaterialRequestPreview

export type ScheduleTaskPreview = {
  type: "schedule_task"
  homeId: string
  homeAddress: string
  taskId: string
  taskName: string
  scheduledDate: string
  contractorId: string | null
  contractorName: string | null
  smsConfirmation?: boolean
  validationWarnings?: string[]
}

export type PunchlistPreview = {
  type: "create_punchlist"
  homeId: string
  homeAddress: string
  taskId: string
  taskName: string
  items: Array<{ title: string; description?: string }>
  dueDate: string | null
  trade?: string
}

export type MaterialRequestPreview = {
  type: "create_material_request"
  homeId: string | null
  homeAddress: string | null
  material: string
  quantity: string
  neededBy: string | null
  vendor: string | null
}
