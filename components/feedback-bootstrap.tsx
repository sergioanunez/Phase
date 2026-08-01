"use client"

import { useEffect } from "react"
import { preloadFeedbackAudio } from "@/lib/feedback"

/**
 * Preloads the completion chime after mount / first pointer so playback stays latency-free.
 */
export function FeedbackBootstrap() {
  useEffect(() => {
    preloadFeedbackAudio()

    const warm = () => {
      preloadFeedbackAudio()
      window.removeEventListener("pointerdown", warm)
      window.removeEventListener("keydown", warm)
    }
    window.addEventListener("pointerdown", warm, { once: true, passive: true })
    window.addEventListener("keydown", warm, { once: true })
    return () => {
      window.removeEventListener("pointerdown", warm)
      window.removeEventListener("keydown", warm)
    }
  }, [])

  return null
}
