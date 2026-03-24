import type { TaskRescheduleReason } from "@prisma/client"

export const TASK_RESCHEDULE_REASON_OPTIONS: { value: TaskRescheduleReason; label: string }[] = [
  { value: "previous_task_incomplete", label: "Previous task not complete" },
  { value: "trade_unavailable", label: "Trade unavailable" },
  { value: "material_delay", label: "Material delay" },
  { value: "inspection_failed", label: "Inspection failed / not passed" },
  { value: "weather", label: "Weather" },
  { value: "scheduling_conflict", label: "Scheduling conflict" },
  { value: "other", label: "Other" },
]

const LABEL_MAP = Object.fromEntries(
  TASK_RESCHEDULE_REASON_OPTIONS.map((o) => [o.value, o.label])
) as Record<TaskRescheduleReason, string>

export function labelForRescheduleReason(reason: TaskRescheduleReason): string {
  return LABEL_MAP[reason] ?? reason
}
