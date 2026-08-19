import type { PrismaClient } from "@prisma/client"
import { compareWorkTemplateCategoryNamesForAdminDisplay } from "@/lib/work-template-display-order"
import { workTemplateItemWhereForTenant } from "@/lib/work-template-tenant-scope"

const SEQ_START = 100
const SEQ_STEP = 100
const POS_START = 100
const POS_STEP = 100

type PrismaLike = Pick<
  PrismaClient,
  "workTemplateCategory" | "workTemplateItem" | "$transaction"
>

/**
 * True when a template item should get a new itemPosition (append to category).
 * Same-category edits must keep the current position so save does not jump the item to the end.
 */
export function shouldAppendItemPositionOnCategoryAssign(params: {
  previousCategoryId: string | null | undefined
  nextCategoryId: string
}): boolean {
  return params.previousCategoryId !== params.nextCategoryId
}

/**
 * Single global execution order: categories by categoryPosition, items by itemPosition.
 * Writes sequenceOrder (Flow / schedules) and optionalCategory (gates, legacy reads).
 */
export async function recomputeGlobalSequenceForCompany(
  prisma: PrismaLike,
  companyId: string
): Promise<void> {
  const categories = await prisma.workTemplateCategory.findMany({
    where: { companyId },
    orderBy: [{ categoryPosition: "asc" }, { name: "asc" }],
    include: {
      templateItems: {
        orderBy: [{ itemPosition: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      },
    },
  })

  const orphans = await prisma.workTemplateItem.findMany({
    where: { companyId, workTemplateCategoryId: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })

  let seq = SEQ_START
  const updates: Array<{ id: string; sequenceOrder: number; optionalCategory: string | null }> = []

  for (const cat of categories) {
    for (const item of cat.templateItems) {
      updates.push({
        id: item.id,
        sequenceOrder: seq,
        optionalCategory: cat.name,
      })
      seq += SEQ_STEP
    }
  }

  for (const item of orphans) {
    updates.push({
      id: item.id,
      sequenceOrder: seq,
      optionalCategory: item.optionalCategory ?? "Uncategorized",
    })
    seq += SEQ_STEP
  }

  if (updates.length === 0) return

  await prisma.$transaction(
    updates.map((u) =>
      prisma.workTemplateItem.update({
        where: { id: u.id },
        data: { sequenceOrder: u.sequenceOrder, optionalCategory: u.optionalCategory },
      })
    )
  )
}

/** Next category position after max existing. */
export async function nextCategoryPosition(
  prisma: PrismaLike,
  companyId: string
): Promise<number> {
  const agg = await prisma.workTemplateCategory.aggregate({
    where: { companyId },
    _max: { categoryPosition: true },
  })
  return (agg._max.categoryPosition ?? 0) + POS_STEP
}

/** Next item position within a category. */
export async function nextItemPosition(
  prisma: PrismaLike,
  categoryId: string
): Promise<number> {
  const agg = await prisma.workTemplateItem.aggregate({
    where: { workTemplateCategoryId: categoryId },
    _max: { itemPosition: true },
  })
  return (agg._max.itemPosition ?? 0) + POS_STEP
}

export async function ensureWorkTemplateCategoryByName(
  prisma: PrismaClient,
  companyId: string,
  rawName: string | null | undefined
): Promise<{ id: string; name: string }> {
  const name = (rawName || "Uncategorized").trim() || "Uncategorized"
  const existing = await prisma.workTemplateCategory.findUnique({
    where: { companyId_name: { companyId, name } },
  })
  if (existing) return { id: existing.id, name: existing.name }
  const pos = await nextCategoryPosition(prisma, companyId)
  const created = await prisma.workTemplateCategory.create({
    data: { companyId, name, categoryPosition: pos },
  })
  return { id: created.id, name: created.name }
}

/**
 * Infer category rows and item positions from a global id list (legacy reorder / import fixes).
 * Labels come from each row's optionalCategory at time of call.
 */
export async function syncCategoryStructureFromGlobalOrder(
  prisma: PrismaClient,
  companyId: string,
  orderedTemplateIds: string[]
): Promise<void> {
  if (orderedTemplateIds.length === 0) return

  const items = await prisma.workTemplateItem.findMany({
    where: workTemplateItemWhereForTenant(companyId),
    select: { id: true, optionalCategory: true },
  })
  const byId = new Map(items.map((t) => [t.id, t]))

  const categoryOrder: string[] = []
  for (const id of orderedTemplateIds) {
    const row = byId.get(id)
    if (!row) continue
    const label = (row.optionalCategory || "Uncategorized").trim() || "Uncategorized"
    if (!categoryOrder.includes(label)) categoryOrder.push(label)
  }

  let catPos = POS_START
  const nameToCategoryId = new Map<string, string>()
  for (const name of categoryOrder) {
    const row = await prisma.workTemplateCategory.upsert({
      where: { companyId_name: { companyId, name } },
      create: { companyId, name, categoryPosition: catPos },
      update: { categoryPosition: catPos },
    })
    nameToCategoryId.set(name, row.id)
    catPos += POS_STEP
  }

  const lastItemPos = new Map<string, number>()
  for (const id of orderedTemplateIds) {
    const row = byId.get(id)
    if (!row) continue
    const label = (row.optionalCategory || "Uncategorized").trim() || "Uncategorized"
    const catId = nameToCategoryId.get(label)
    if (!catId) continue
    const prev = lastItemPos.get(catId)
    const ip = prev == null ? POS_START : prev + POS_STEP
    lastItemPos.set(catId, ip)
    await prisma.workTemplateItem.update({
      where: { id },
      data: {
        companyId,
        workTemplateCategoryId: catId,
        itemPosition: ip,
        optionalCategory: label,
      },
    })
  }

  await recomputeGlobalSequenceForCompany(prisma, companyId)
}

/**
 * One-time / idempotent: create categories from optionalCategory, assign positions from current order.
 */
export async function backfillWorkTemplateCategoriesForCompany(
  prisma: PrismaClient,
  companyId: string
): Promise<void> {
  const items = await prisma.workTemplateItem.findMany({
    where: workTemplateItemWhereForTenant(companyId),
    select: {
      id: true,
      optionalCategory: true,
      sortOrder: true,
      sequenceOrder: true,
      name: true,
      createdAt: true,
      workTemplateCategoryId: true,
    },
  })
  if (items.length === 0) return

  const allLinked = items.every((t) => t.workTemplateCategoryId != null)
  if (allLinked) {
    await recomputeGlobalSequenceForCompany(prisma, companyId)
    return
  }

  const byLabel = new Map<string, typeof items>()
  for (const t of items) {
    const label = (t.optionalCategory || "Uncategorized").trim() || "Uncategorized"
    if (!byLabel.has(label)) byLabel.set(label, [])
    byLabel.get(label)!.push(t)
  }

  const categoryNames = Array.from(byLabel.keys()).sort(compareWorkTemplateCategoryNamesForAdminDisplay)

  let catPos = POS_START
  const labelToCatId = new Map<string, string>()
  for (const name of categoryNames) {
    const row = await prisma.workTemplateCategory.upsert({
      where: { companyId_name: { companyId, name } },
      create: { companyId, name, categoryPosition: catPos },
      update: { categoryPosition: catPos },
    })
    labelToCatId.set(name, row.id)
    catPos += POS_STEP

    const group = byLabel.get(name) ?? []
    const sorted = [...group].sort((a, b) => {
      const aSeq = a.sequenceOrder
      const bSeq = b.sequenceOrder
      if (aSeq != null && bSeq != null && aSeq !== bSeq) return aSeq - bSeq
      if (aSeq != null && bSeq == null) return -1
      if (aSeq == null && bSeq != null) return 1
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.name.localeCompare(b.name)
    })
    let ip = POS_START
    for (const t of sorted) {
      await prisma.workTemplateItem.update({
        where: { id: t.id },
        data: {
          companyId,
          workTemplateCategoryId: row.id,
          itemPosition: ip,
          optionalCategory: name,
        },
      })
      ip += POS_STEP
    }
  }

  await recomputeGlobalSequenceForCompany(prisma, companyId)
}
