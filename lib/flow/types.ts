export type FlowCardState = "READY" | "WAITING" | "IN_PROGRESS"

export type FlowActionCtaType = "OPEN_TASK" | "OPEN_SCHEDULE_MODAL" | "OPEN_HOME_TASKS"

export type FlowActionCta = {
  type: FlowActionCtaType
  taskId: string
  homeId: string
}

export type FlowAction = {
  homeId: string
  homeAddress: string
  subdivisionName: string
  taskId: string
  taskInstanceId: string
  taskName: string
  contractorName?: string
  type: "PREP" | "EXECUTE"
  actionDate: string
  forecastStart: string
  forecastFinish: string
  prepStart: string
  prepLeadDays: number
  /** How prep lead was determined: contractor (from template's contractor), override (template override), unassigned */
  leadTimeSource?: "contractor" | "override" | "unassigned"
  executionEligible: boolean
  requiresOrdering: boolean
  isOverdue: boolean
  /** For sorting: slack in working days (target - forecast completion); smaller = higher priority */
  slackWorkingDays?: number
  sortOrderSnapshot: number
  /** For Details: dependency task names and completion status */
  dependencyStatus?: Array<{ name: string; complete: boolean }>
  /** Card state: READY = actionable, WAITING = blocked on prior task, IN_PROGRESS = task in progress */
  state?: FlowCardState
  /** Natural language label for the card (e.g. "Start work: Pour Slab", "Waiting on: Forms") */
  actionLabel?: string
  /** CTA to open the correct task context (modal or home deep-link) */
  actionCta?: FlowActionCta
  /** True when home has no start date or no scheduled tasks (construction not started) */
  notStarted?: boolean
}

export type FlowScope = "today"
export type FlowFilter = "all" | "prep" | "execute"

export type ComputeFlowInput = {
  companyId: string
  userId: string
  role: string
  scope?: FlowScope
  filter?: FlowFilter
  search?: string
}

export type ComputeFlowResult = {
  actions: FlowAction[]
  circularWarning?: string
}

/** Grouped by home for Flow UI: one card per address */
export type FlowHomeGroup = {
  homeId: string
  address: string
  communityName?: string
  actions: FlowAction[]
  nextActionDate?: string
  counts: { prep: number; execute: number; overdue: number }
  /** True when home has no start date or no scheduled tasks */
  notStarted?: boolean
}
