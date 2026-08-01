/**
 * Client feedback preferences (sounds + haptics).
 * Persisted in localStorage; defaults enabled.
 */

export const FEEDBACK_PREFS_STORAGE_KEY = "phase-feedback-prefs"

export type FeedbackPreferences = {
  completionSounds: boolean
  hapticFeedback: boolean
}

export const DEFAULT_FEEDBACK_PREFERENCES: FeedbackPreferences = {
  completionSounds: true,
  hapticFeedback: true,
}

type Listener = (prefs: FeedbackPreferences) => void

const listeners = new Set<Listener>()

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function readFeedbackPreferences(): FeedbackPreferences {
  if (!canUseStorage()) return { ...DEFAULT_FEEDBACK_PREFERENCES }
  try {
    const raw = window.localStorage.getItem(FEEDBACK_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_FEEDBACK_PREFERENCES }
    const parsed = JSON.parse(raw) as Partial<FeedbackPreferences>
    return {
      completionSounds:
        typeof parsed.completionSounds === "boolean"
          ? parsed.completionSounds
          : DEFAULT_FEEDBACK_PREFERENCES.completionSounds,
      hapticFeedback:
        typeof parsed.hapticFeedback === "boolean"
          ? parsed.hapticFeedback
          : DEFAULT_FEEDBACK_PREFERENCES.hapticFeedback,
    }
  } catch {
    return { ...DEFAULT_FEEDBACK_PREFERENCES }
  }
}

export function writeFeedbackPreferences(prefs: FeedbackPreferences): void {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(FEEDBACK_PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota / private mode */
  }
  for (const listener of listeners) listener(prefs)
}

export function updateFeedbackPreferences(
  patch: Partial<FeedbackPreferences>
): FeedbackPreferences {
  const next = { ...readFeedbackPreferences(), ...patch }
  writeFeedbackPreferences(next)
  return next
}

export function subscribeFeedbackPreferences(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
