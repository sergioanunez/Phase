export type FlowMode = "PREP" | "EXECUTE"

export type FlowModeLabel = {
  short: string
  verb: string
}

export function getFlowModeLabel(type: FlowMode): FlowModeLabel {
  if (type === "PREP") {
    return {
      short: "GET READY",
      verb: "Get ready",
    }
  }

  return {
    short: "START WORK",
    verb: "Start work",
  }
}

