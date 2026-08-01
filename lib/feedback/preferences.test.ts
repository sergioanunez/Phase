import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  DEFAULT_FEEDBACK_PREFERENCES,
  FEEDBACK_PREFS_STORAGE_KEY,
  readFeedbackPreferences,
  updateFeedbackPreferences,
} from "./preferences"

describe("feedback preferences", () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v)
        },
        removeItem: (k: string) => {
          store.delete(k)
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("defaults to sounds and haptics enabled", () => {
    expect(readFeedbackPreferences()).toEqual(DEFAULT_FEEDBACK_PREFERENCES)
  })

  it("persists independent toggles", () => {
    updateFeedbackPreferences({ completionSounds: false })
    expect(readFeedbackPreferences()).toEqual({
      completionSounds: false,
      hapticFeedback: true,
    })
    updateFeedbackPreferences({ hapticFeedback: false })
    expect(readFeedbackPreferences()).toEqual({
      completionSounds: false,
      hapticFeedback: false,
    })
    expect(store.get(FEEDBACK_PREFS_STORAGE_KEY)).toContain("completionSounds")
  })
})
