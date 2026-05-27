/**
 * Founders10 application — operational challenge options (multi-select).
 * Keys are stable for analytics; labels are display copy.
 */

export const FOUNDERS10_CHALLENGE_OPTIONS = [
  { key: "keeping-schedules-on-track", label: "Keeping schedules on track" },
  { key: "subcontractor-coordination", label: "Subcontractor coordination" },
  { key: "delays-between-phases", label: "Delays between phases" },
  { key: "lack-of-visibility", label: "Lack of visibility" },
  { key: "communication-across-teams", label: "Communication across teams" },
  { key: "material-coordination", label: "Material coordination" },
  { key: "managing-multiple-communities", label: "Managing multiple communities" },
  { key: "other", label: "Other" },
] as const

export type Founders10ChallengeKey = (typeof FOUNDERS10_CHALLENGE_OPTIONS)[number]["key"]

export const FOUNDERS10_CHALLENGE_KEY_VALUES: readonly Founders10ChallengeKey[] =
  FOUNDERS10_CHALLENGE_OPTIONS.map((o) => o.key)

export function founders10ChallengeLabel(key: string): string {
  const match = FOUNDERS10_CHALLENGE_OPTIONS.find((o) => o.key === key)
  return match?.label ?? key
}

/** Comma-separated labels for legacy log fields / integrations expecting a single string. */
export function founders10ChallengesToLegacySummary(keys: Founders10ChallengeKey[]): string {
  return keys.map((k) => founders10ChallengeLabel(k)).join(", ")
}
