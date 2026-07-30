import { classifyTransactionError } from "@/lib/transactions/retry"
import type { ConnectivityState } from "@/lib/transactions/types"

type ConnectivityListener = (state: ConnectivityState) => void
type HealthCheck = () => Promise<boolean>

export class ConnectivityService {
  private state: ConnectivityState = "checking"
  private readonly listeners = new Set<ConnectivityListener>()
  private started = false

  constructor(private readonly healthCheck: HealthCheck = defaultHealthCheck) {}

  getState(): ConnectivityState {
    return this.state
  }

  subscribe(listener: ConnectivityListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.started || typeof window === "undefined") return
    this.started = true
    window.addEventListener("online", this.handleOnline)
    window.addEventListener("offline", this.handleOffline)
    document.addEventListener("visibilitychange", this.handleVisibility)

    if (navigator.onLine === false) {
      this.setState("offline")
    } else {
      void this.check()
    }
  }

  stop(): void {
    if (!this.started || typeof window === "undefined") return
    window.removeEventListener("online", this.handleOnline)
    window.removeEventListener("offline", this.handleOffline)
    document.removeEventListener("visibilitychange", this.handleVisibility)
    this.started = false
  }

  async check(): Promise<ConnectivityState> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.setState("offline")
      return this.state
    }

    this.setState("checking")
    try {
      const healthy = await this.healthCheck()
      this.setState(healthy ? "online" : "degraded")
    } catch {
      this.setState("degraded")
    }
    return this.state
  }

  reportRequestSuccess(): void {
    this.setState("online")
  }

  reportRequestFailure(error: unknown): void {
    const classified = classifyTransactionError(error)
    if (classified.kind === "retriable") {
      this.setState(
        typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "degraded"
      )
    }
  }

  private readonly handleOnline = () => {
    void this.check()
  }

  private readonly handleOffline = () => {
    this.setState("offline")
  }

  private readonly handleVisibility = () => {
    if (document.visibilityState === "visible") void this.check()
  }

  private setState(state: ConnectivityState): void {
    if (state === this.state) return
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}

async function defaultHealthCheck(): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch("/", {
      method: "HEAD",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
    return response.ok
  } finally {
    clearTimeout(timeout)
  }
}
