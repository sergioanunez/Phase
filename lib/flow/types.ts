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
  executionEligible: boolean
  requiresOrdering: boolean
  isOverdue: boolean
  /** For sorting: slack in working days (target - forecast completion); smaller = higher priority */
  slackWorkingDays?: number
  sortOrderSnapshot: number
  /** For Details: dependency task names and completion status */
  dependencyStatus?: Array<{ name: string; complete: boolean }>
}

export type FlowScope = "today" | "next7" | "overdue"
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
}
