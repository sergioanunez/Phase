/**
 * Haptic helpers — degrade silently when unsupported.
 */

import { readFeedbackPreferences } from "./preferences"

/** Medium success pattern (~gentle double pulse). */
const SUCCESS_PATTERN_MS = [14, 42, 22] as const

export function hapticSuccess(): void {
  try {
    if (typeof navigator === "undefined") return
    if (!readFeedbackPreferences().hapticFeedback) return
    if (typeof navigator.vibrate !== "function") return
    navigator.vibrate([...SUCCESS_PATTERN_MS])
  } catch {
    /* ignore */
  }
}
