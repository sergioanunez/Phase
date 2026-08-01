/**
 * Central Feedback service for premium success interactions.
 * Call only after an action has actually succeeded.
 */

import { playTaskCompleteSound, preloadFeedbackAudio } from "./audio"
import { hapticSuccess } from "./haptics"

export {
  preloadFeedbackAudio,
  playTaskCompleteSound,
  TASK_COMPLETE_SOUND_SRC,
} from "./audio"
export { hapticSuccess } from "./haptics"
export {
  readFeedbackPreferences,
  writeFeedbackPreferences,
  updateFeedbackPreferences,
  subscribeFeedbackPreferences,
  DEFAULT_FEEDBACK_PREFERENCES,
  type FeedbackPreferences,
} from "./preferences"

/**
 * Celebrate a successfully completed work item (sound + haptic).
 * Safe to call from UI; never throws; never blocks the main flow.
 */
export function playTaskComplete(): void {
  void playTaskCompleteSound()
  hapticSuccess()
}

/** Generic success cue for future reuse. */
export function playSuccess(): void {
  playTaskComplete()
}
