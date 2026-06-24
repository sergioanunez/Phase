import type { TaskNotApplicableReason } from "@prisma/client"

export const TASK_NOT_APPLICABLE_REASON_OPTIONS: {
  value: TaskNotApplicableReason
  label: string
}[] = [
  { value: "not_required_for_lot", label: "Not required for this lot" },
  { value: "option_not_selected", label: "Option not selected" },
  { value: "covered_by_another_task", label: "Covered by another task" },
  { value: "builder_decision", label: "Builder decision" },
  { value: "other", label: "Other" },
]

const LABEL_MAP = Object.fromEntries(
  TASK_NOT_APPLICABLE_REASON_OPTIONS.map((o) => [o.value, o.label])
) as Record<TaskNotApplicableReason, string>

export function labelForNotApplicableReason(reason: TaskNotApplicableReason): string {
  return LABEL_MAP[reason] ?? reason
}
