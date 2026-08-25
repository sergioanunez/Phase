/**
 * Dev-safe performance marks for House Details task mutations (P1).
 * No-ops in production builds; never logs PII.
 */

const ENABLED =
  typeof process !== "undefined" &&
  process.env.NODE_ENV === "development"

function safeMark(name: string): void {
  if (!ENABLED || typeof performance === "undefined" || !performance.mark) return
  try {
    performance.mark(name)
  } catch {
    /* ignore */
  }
}

function safeMeasure(name: string, start: string, end: string): void {
  if (!ENABLED || typeof performance === "undefined" || !performance.measure) return
  try {
    performance.measure(name, start, end)
  } catch {
    /* ignore */
  }
}

let seq = 0

export type MutationPerfSession = {
  id: string
  mark: (step: "t0" | "t1" | "t2" | "t3" | "t4" | "t5") => void
  finish: () => void
}

/**
 * T0 action initiated → T1 request sent → T2 response → T3 local patch
 * → T4 reconcile started → T5 reconcile completed
 */
export function beginMutationPerf(action: string): MutationPerfSession {
  const id = `mut-${++seq}-${action}`
  const names = {
    t0: `${id}:t0`,
    t1: `${id}:t1`,
    t2: `${id}:t2`,
    t3: `${id}:t3`,
    t4: `${id}:t4`,
    t5: `${id}:t5`,
  }
  safeMark(names.t0)
  return {
    id,
    mark(step) {
      safeMark(names[step])
      if (step === "t3") {
        safeMeasure(`${id}:tap-to-patch`, names.t0, names.t3)
        safeMeasure(`${id}:response-to-patch`, names.t2, names.t3)
      }
      if (step === "t5") {
        safeMeasure(`${id}:reconcile`, names.t4, names.t5)
      }
    },
    finish() {
      /* marks retained for Performance panel; no console spam */
    },
  }
}
