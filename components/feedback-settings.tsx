"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import {
  readFeedbackPreferences,
  subscribeFeedbackPreferences,
  updateFeedbackPreferences,
  type FeedbackPreferences,
} from "@/lib/feedback"

export function FeedbackSettings({ className }: { className?: string }) {
  const [prefs, setPrefs] = useState<FeedbackPreferences>(() =>
    readFeedbackPreferences()
  )

  useEffect(() => {
    setPrefs(readFeedbackPreferences())
    return subscribeFeedbackPreferences(setPrefs)
  }, [])

  const setSound = (completionSounds: boolean) => {
    setPrefs(updateFeedbackPreferences({ completionSounds }))
  }

  const setHaptic = (hapticFeedback: boolean) => {
    setPrefs(updateFeedbackPreferences({ hapticFeedback }))
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-white p-4 shadow-sm",
        className
      )}
      aria-labelledby="feedback-settings-heading"
    >
      <h2
        id="feedback-settings-heading"
        className="text-base font-semibold text-foreground"
      >
        Feedback
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Subtle cues when you successfully complete a work item. Stored on this
        device only.
      </p>

      <div className="mt-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border"
            checked={prefs.completionSounds}
            onChange={(e) => setSound(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Completion Sounds
            </span>
            <span className="block text-xs text-muted-foreground">
              Soft chime after a work item is marked complete
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border"
            checked={prefs.hapticFeedback}
            onChange={(e) => setHaptic(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Haptic Feedback
            </span>
            <span className="block text-xs text-muted-foreground">
              Medium vibration on supported phones
            </span>
          </span>
        </label>
      </div>
    </section>
  )
}
