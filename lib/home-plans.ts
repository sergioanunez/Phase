import type { Home, HomePlan, PlanFileType } from "@prisma/client"
import { createId } from "@paralleldrive/cuid2"

/** Canonical tags for uploads (UI + API validation). */
export const HOME_PLAN_TAGS = [
  "Floor Plan",
  "Electrical",
  "Mechanical",
  "Plumbing",
  "Structural",
  "Other",
] as const

export type HomePlanTag = (typeof HOME_PLAN_TAGS)[number]

const TAG_SORT_ORDER = new Map(HOME_PLAN_TAGS.map((t, i) => [t, i]))

export const LEGACY_PLAN_ID = "legacy" as const

export type ListedHomePlan = {
  id: string
  tag: string
  /** Human label (Primary Plan for sole legacy). */
  label: string
  fileName: string
  planFileType: PlanFileType
  createdAt: string
  isLegacy: boolean
}

type HomeWithLegacyPlan = Pick<
  Home,
  | "planStoragePath"
  | "planFileName"
  | "planFileType"
  | "planUploadedAt"
  | "planUploadedByUserId"
>

/**
 * Merge Home.planStoragePath (legacy) with HomePlan rows. Dedupes by storage path.
 * Sort: tag order (known tags first), then newest first within tag.
 */
export function listMergedHomePlans(home: HomeWithLegacyPlan, rows: HomePlan[]): ListedHomePlan[] {
  const pathSeen = new Set<string>()
  const out: ListedHomePlan[] = []

  const sortedRows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  for (const p of sortedRows) {
    pathSeen.add(p.storagePath)
    out.push({
      id: p.id,
      tag: p.tag,
      label: p.fileName,
      fileName: p.fileName,
      planFileType: p.planFileType,
      createdAt: p.createdAt.toISOString(),
      isLegacy: false,
    })
  }

  if (home.planStoragePath && !pathSeen.has(home.planStoragePath)) {
    out.push({
      id: LEGACY_PLAN_ID,
      tag: "Floor Plan",
      label: "Primary Plan",
      fileName: home.planFileName || "Plan",
      planFileType: home.planFileType ?? "PDF",
      createdAt: (home.planUploadedAt ?? new Date(0)).toISOString(),
      isLegacy: true,
    })
  }

  out.sort((a, b) => {
    const ta = TAG_SORT_ORDER.get(a.tag as HomePlanTag) ?? 999
    const tb = TAG_SORT_ORDER.get(b.tag as HomePlanTag) ?? 999
    if (ta !== tb) return ta - tb
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return out
}

export function groupPlansByTag(plans: ListedHomePlan[]): Map<string, ListedHomePlan[]> {
  const m = new Map<string, ListedHomePlan[]>()
  for (const p of plans) {
    const list = m.get(p.tag) ?? []
    list.push(p)
    m.set(p.tag, list)
  }
  return m
}

/** Total plans shown to users (legacy + rows, deduped by storage path). */
export function countMergedPlans(home: HomeWithLegacyPlan, rows: HomePlan[]): number {
  return listMergedHomePlans(home, rows).length
}

export function isAllowedPlanTag(tag: string): tag is HomePlanTag {
  return (HOME_PLAN_TAGS as readonly string[]).includes(tag)
}

export function parsePlanTag(raw: string | null | undefined): HomePlanTag {
  const t = (raw ?? "").trim()
  if (isAllowedPlanTag(t)) return t
  return "Other"
}

export function nextHomePlanStoragePath(homeId: string, ext: string): { planId: string; storagePath: string } {
  const planId = createId()
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`
  return {
    planId,
    storagePath: `homes/${homeId}/plans/${planId}${safeExt}`,
  }
}
