/**
 * Category-level critical path duration (longest dependency chain within a category).
 * Used for Work Items Template screen to show "• Nd" per category.
 */

export interface WorkTemplateForDuration {
  id: string
  /** Duration in working days; treat missing/undefined as 0 */
  defaultDurationDays?: number
  dependencies?: Array<{ dependsOnItemId: string }>
}

/**
 * Computes the critical path duration (longest path in days) for a set of templates
 * that belong to the same category. Only in-category dependencies are considered.
 * Returns null if the dependency graph contains a cycle.
 *
 * @param templates - Templates in one category (same category filter applied by caller)
 * @returns Total days of the longest path, or null if cycle / cannot compute
 */
export function computeCategoryCriticalPathDuration(
  templates: WorkTemplateForDuration[]
): number | null {
  if (templates.length === 0) return 0

  const idSet = new Set(templates.map((t) => t.id))
  const duration = (t: WorkTemplateForDuration): number =>
    typeof t.defaultDurationDays === "number" && t.defaultDurationDays >= 0
      ? t.defaultDurationDays
      : 0

  // In-category deps: template id -> list of template ids it depends on (within this category)
  const deps = new Map<string, string[]>()
  for (const t of templates) {
    const inCategory = (t.dependencies ?? [])
      .map((d) => d.dependsOnItemId)
      .filter((id) => idSet.has(id))
    deps.set(t.id, inCategory)
  }

  // Topological sort (Kahn). Edge dep -> t means "dep must finish before t". inDegree[t] = number of deps of t.
  const inDegree = new Map<string, number>()
  for (const t of templates) {
    inDegree.set(t.id, deps.get(t.id)?.length ?? 0)
  }
  const queue = templates.filter((t) => (inDegree.get(t.id) ?? 0) === 0).map((t) => t.id)
  const topo: string[] = []
  while (queue.length > 0) {
    const u = queue.shift()!
    topo.push(u)
    for (const t of templates) {
      if (deps.get(t.id)?.includes(u)) {
        const newDeg = (inDegree.get(t.id) ?? 0) - 1
        inDegree.set(t.id, newDeg)
        if (newDeg === 0) queue.push(t.id)
      }
    }
  }
  if (topo.length !== templates.length) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        "[categoryDuration] Cycle detected in category template dependencies; duration shown as —"
      )
    }
    return null
  }

  // Longest path to finish: lp[t] = duration(t) + max(lp[dep] for dep in deps[t]). Process in topo order.
  const lp = new Map<string, number>()
  for (let i = 0; i < topo.length; i++) {
    const id = topo[i]
    const t = templates.find((x) => x.id === id)!
    const d = duration(t)
    const depIds = deps.get(id) ?? []
    const maxDep = depIds.length
      ? Math.max(...depIds.map((depId) => lp.get(depId)!))
      : 0
    lp.set(id, d + maxDep)
  }

  return Math.max(...lp.values(), 0)
}
