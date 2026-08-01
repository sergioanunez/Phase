/**
 * Classify a scheduled task for calendar filters.
 * Inspections are detected by task/category name heuristics until a dedicated type exists.
 */
export function classifyCalendarTaskType(params: {
  taskName: string
  categoryName?: string | null
}): "inspection" | "trade" {
  const haystack = `${params.taskName} ${params.categoryName ?? ""}`.toLowerCase()
  if (haystack.includes("inspection")) return "inspection"
  return "trade"
}
