/** Gap-based display order for drag-reorder lists (homes, communities, tasks, templates, …). */
export const DISPLAY_ORDER_STEP = 100

export function displayOrderForIndex(index: number): number {
  return (index + 1) * DISPLAY_ORDER_STEP
}

export function displayOrdersFromIds(orderedIds: string[]): Array<{ id: string; displayOrder: number }> {
  return orderedIds.map((id, index) => ({
    id,
    displayOrder: displayOrderForIndex(index),
  }))
}

/** Next slot after the current max order in a list (e.g. new home in subdivision). */
export function nextDisplayOrder(maxExisting: number | null | undefined): number {
  const max = maxExisting ?? 0
  return max > 0 ? max + DISPLAY_ORDER_STEP : DISPLAY_ORDER_STEP
}
