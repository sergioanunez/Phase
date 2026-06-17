import type { Prisma } from "@prisma/client"

export type HomeOrderFields = {
  displayOrder?: number | null
  addressOrLot?: string | null
  startDate?: string | Date | null
  createdAt?: string | Date | null
}

export const homeOrderByDisplayOrder: Prisma.HomeOrderByWithRelationInput[] = [
  { displayOrder: "asc" },
  { addressOrLot: "asc" },
  { createdAt: "asc" },
]

export function compareHomesByDisplayOrder(a: HomeOrderFields, b: HomeOrderFields): number {
  const orderA = a.displayOrder ?? 0
  const orderB = b.displayOrder ?? 0
  if (orderA !== orderB) return orderA - orderB

  const addr = (a.addressOrLot ?? "").localeCompare(b.addressOrLot ?? "", undefined, {
    numeric: true,
    sensitivity: "base",
  })
  if (addr !== 0) return addr

  const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return createdA - createdB
}

function extractLeadingNumber(value: string): number | null {
  const match = value.trim().match(/\d+/)
  if (!match) return null
  const n = Number.parseInt(match[0]!, 10)
  return Number.isFinite(n) ? n : null
}

export type HomeAutoSortMode = "address" | "lot" | "startDate"

export function autoSortHomes<T extends HomeOrderFields>(homes: T[], mode: HomeAutoSortMode): T[] {
  const copy = [...homes]
  if (mode === "address") {
    copy.sort((a, b) =>
      (a.addressOrLot ?? "").localeCompare(b.addressOrLot ?? "", undefined, {
        numeric: true,
        sensitivity: "base",
      })
    )
    return copy
  }
  if (mode === "lot") {
    copy.sort((a, b) => {
      const lotA = extractLeadingNumber(a.addressOrLot ?? "")
      const lotB = extractLeadingNumber(b.addressOrLot ?? "")
      if (lotA != null && lotB != null && lotA !== lotB) return lotA - lotB
      if (lotA != null && lotB == null) return -1
      if (lotA == null && lotB != null) return 1
      return (a.addressOrLot ?? "").localeCompare(b.addressOrLot ?? "", undefined, {
        numeric: true,
        sensitivity: "base",
      })
    })
    return copy
  }
  copy.sort((a, b) => {
    const startA = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY
    const startB = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY
    if (startA !== startB) return startA - startB
    return compareHomesByDisplayOrder(a, b)
  })
  return copy
}
