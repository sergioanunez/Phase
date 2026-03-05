import type { FlowAction, FlowHomeGroup } from "./types"

export type HomeRisk = "NOT_STARTED" | "ON_TRACK" | "AT_RISK" | "SLIPPING"

export type FlowBriefing = {
  overdueCount: number
  dueTodayCount: number
  startWorkCount: number
  slippingHomes: number
  atRiskHomes: number
  attentionHomes: number
  notStartedHomes: number
}

function getTodayDateOnly(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

export function getHomeRisk(group: FlowHomeGroup, today: string = getTodayDateOnly()): HomeRisk {
  if (group.notStarted) {
    return "NOT_STARTED"
  }

  let hasOverdueExecute = false
  let hasOverduePrep = false
  let hasExecuteToday = false

  for (const action of group.actions) {
    if (action.type === "EXECUTE" && action.isOverdue) {
      hasOverdueExecute = true
    }
    if (action.type === "PREP" && action.isOverdue) {
      hasOverduePrep = true
    }
    if (action.type === "EXECUTE" && !action.isOverdue && action.actionDate === today) {
      hasExecuteToday = true
    }
  }

  if (hasOverdueExecute) {
    return "SLIPPING"
  }
  if (hasOverduePrep || hasExecuteToday) {
    return "AT_RISK"
  }
  return "ON_TRACK"
}

export function computeFlowBriefing(groups: FlowHomeGroup[]): FlowBriefing {
  const today = getTodayDateOnly()

  let overdueCount = 0
  let dueTodayCount = 0
  let startWorkCount = 0
  let slippingHomes = 0
  let atRiskHomes = 0
  let notStartedHomes = 0

  for (const group of groups) {
    const risk = getHomeRisk(group, today)

    for (const action of group.actions) {
      if (action.isOverdue) {
        overdueCount += 1
      }
      if (!action.isOverdue && action.actionDate === today) {
        dueTodayCount += 1
      }
      if (action.type === "EXECUTE") {
        startWorkCount += 1
      }
    }

    if (risk === "NOT_STARTED") {
      notStartedHomes += 1
    } else if (risk === "SLIPPING") {
      slippingHomes += 1
    } else if (risk === "AT_RISK") {
      atRiskHomes += 1
    }
  }

  const attentionHomes = slippingHomes + atRiskHomes

  return {
    overdueCount,
    dueTodayCount,
    startWorkCount,
    slippingHomes,
    atRiskHomes,
    attentionHomes,
    notStartedHomes,
  }
}

