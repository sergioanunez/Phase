import type { FlowAction, FlowHomeGroup, FlowUrgency } from "./types"

export type HomeRisk = "OVERDUE" | "AT_RISK" | "ON_TRACK"

export type FlowBriefing = {
  overdueCount: number
  atRiskCount: number
  readyCount: number
  futureCount: number
  houseCount: number
}

function urgencyOf(action: FlowAction): FlowUrgency {
  return action.urgency ?? (action.isOverdue ? "OVERDUE" : "READY")
}

export function getHomeRisk(group: FlowHomeGroup): HomeRisk {
  const urgency = group.urgency ?? group.actions[0]?.urgency
  if (urgency === "OVERDUE") return "OVERDUE"
  if (urgency === "AT_RISK") return "AT_RISK"
  return "ON_TRACK"
}

export function computeFlowBriefing(groups: FlowHomeGroup[]): FlowBriefing {
  let overdueCount = 0
  let atRiskCount = 0
  let readyCount = 0
  let futureCount = 0

  for (const group of groups) {
    const action = group.actions[0]
    if (!action) continue
    switch (urgencyOf(action)) {
      case "OVERDUE":
        overdueCount += 1
        break
      case "AT_RISK":
        atRiskCount += 1
        break
      case "READY":
        readyCount += 1
        break
      case "FUTURE":
        futureCount += 1
        break
    }
  }

  return {
    overdueCount,
    atRiskCount,
    readyCount,
    futureCount,
    houseCount: groups.length,
  }
}
