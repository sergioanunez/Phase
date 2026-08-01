/**
 * Audio playback for Feedback service.
 * Replace public/sounds/task-complete.wav to swap the chime.
 */

import { readFeedbackPreferences } from "./preferences"

/** Single replaceable completion chime. */
export const TASK_COMPLETE_SOUND_SRC = "/sounds/task-complete.wav"

let audioEl: HTMLAudioElement | null = null
let preloadStarted = false

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null
  if (!audioEl) {
    audioEl = new Audio(TASK_COMPLETE_SOUND_SRC)
    audioEl.preload = "auto"
    audioEl.volume = 0.55
  }
  return audioEl
}

/** Warm the audio buffer after app start (and again on first gesture if needed). */
export function preloadFeedbackAudio(): void {
  if (preloadStarted) return
  preloadStarted = true
  try {
    const audio = getAudio()
    if (!audio) return
    audio.load()
  } catch {
    /* ignore */
  }
}

/**
 * Play the task-complete chime. No-ops when disabled or blocked by autoplay.
 * Never throws.
 */
export async function playTaskCompleteSound(): Promise<void> {
  try {
    if (!readFeedbackPreferences().completionSounds) return
    const audio = getAudio()
    if (!audio) return
    audio.currentTime = 0
    await audio.play()
  } catch {
    /* autoplay / decode / missing file — silent */
  }
}
