export type OutboxFailureKind = "retriable" | "permanent" | "configuration"

export type ClassifiedOutboxError = {
  kind: OutboxFailureKind
  code: string
  message: string
  retryAfterMs?: number
}

const RETRIABLE_TWILIO = new Set([20429, 20500, 20503, 20504])
const PERMANENT_TWILIO = new Set([21211, 21610, 21408, 21614, 21214])

export function classifyOutboxError(error: unknown): ClassifiedOutboxError {
  if (error && typeof error === "object") {
    const anyErr = error as {
      code?: string | number
      status?: number
      message?: string
      moreInfo?: string
    }
    const numeric =
      typeof anyErr.code === "number"
        ? anyErr.code
        : typeof anyErr.code === "string" && /^\d+$/.test(anyErr.code)
          ? Number(anyErr.code)
          : undefined

    if (numeric != null && RETRIABLE_TWILIO.has(numeric)) {
      return {
        kind: "retriable",
        code: `TWILIO_${numeric}`,
        message: anyErr.message || "Transient Twilio failure",
      }
    }
    if (numeric != null && PERMANENT_TWILIO.has(numeric)) {
      return {
        kind: "permanent",
        code: `TWILIO_${numeric}`,
        message: anyErr.message || "Permanent Twilio rejection",
      }
    }
    if (anyErr.status === 429 || anyErr.status === 502 || anyErr.status === 503 || anyErr.status === 504) {
      return {
        kind: "retriable",
        code: `HTTP_${anyErr.status}`,
        message: anyErr.message || "Temporary upstream failure",
      }
    }
    if (
      typeof anyErr.message === "string" &&
      /missing.*(twilio|credential|auth|account)/i.test(anyErr.message)
    ) {
      return {
        kind: "configuration",
        code: "PROVIDER_MISCONFIGURED",
        message: "Messaging provider is not configured",
      }
    }
  }

  if (error instanceof TypeError) {
    return { kind: "retriable", code: "NETWORK_ERROR", message: "Network request failed" }
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return { kind: "retriable", code: "TIMEOUT", message: "Provider request timed out" }
  }

  return {
    kind: "permanent",
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "Unknown outbox failure",
  }
}

export function computeOutboxRetryDelayMs(
  attempts: number,
  retryAfterMs?: number,
  random: () => number = Math.random
): number {
  if (retryAfterMs != null && Number.isFinite(retryAfterMs)) {
    return Math.max(0, Math.min(retryAfterMs, 5 * 60_000))
  }
  const exponent = Math.max(0, attempts - 1)
  const base = Math.min(3_000 * 2 ** exponent, 5 * 60_000)
  const jitter = 0.8 + random() * 0.4
  return Math.round(base * jitter)
}
