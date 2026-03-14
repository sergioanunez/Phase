/**
 * Resolve intent fragments to entity ids using existing data.
 * Used only server-side; respects allowedHomeIds for Superintendent.
 */

import { prisma } from "@/lib/prisma"

export type ResolveContext = {
  companyId: string
  allowedHomeIds: string[]
}

/** Normalize for fuzzy match: lowercase, collapse spaces */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Find best matching home by address fragment (within allowed homes). */
export async function resolveHome(
  ctx: ResolveContext,
  addressFragment: string
): Promise<{ id: string; addressOrLot: string } | null> {
  if (!addressFragment || ctx.allowedHomeIds.length === 0) return null
  const needle = norm(addressFragment)
  const homes = await prisma.home.findMany({
    where: { id: { in: ctx.allowedHomeIds }, companyId: ctx.companyId },
    select: { id: true, addressOrLot: true },
  })
  const scored = homes.map((h) => {
    const addr = norm(h.addressOrLot)
    const exact = addr === needle
    const contains = addr.includes(needle) || needle.includes(addr)
    const starts = addr.startsWith(needle) || needle.startsWith(addr)
    let score = 0
    if (exact) score = 100
    else if (starts) score = 80
    else if (contains) score = 50
    return { home: h, score }
  })
  scored.sort((a, b) => b.score - a.score)
  const top = scored[0]
  return top && top.score > 0 ? top.home : null
}

/** Find task on a home by task name fragment (nameSnapshot or template name). */
export async function resolveTask(
  homeId: string,
  companyId: string,
  taskNameFragment: string
): Promise<{ id: string; nameSnapshot: string; templateName: string } | null> {
  if (!taskNameFragment) return null
  const needle = norm(taskNameFragment)
  const tasks = await prisma.homeTask.findMany({
    where: {
      homeId,
      OR: [
        { companyId },
        { companyId: null, home: { companyId } },
      ],
    },
    include: {
      templateItem: { select: { name: true } },
    },
  })
  const scored = tasks.map((t) => {
    const name = norm(t.nameSnapshot)
    const templateName = norm(t.templateItem?.name ?? "")
    const exact = name === needle || templateName === needle
    const nameContains = name.includes(needle) || needle.includes(name)
    const templateContains = templateName.includes(needle) || needle.includes(templateName)
    let score = 0
    if (exact) score = 100
    else if (nameContains || templateContains) score = 60
    return {
      task: {
        id: t.id,
        nameSnapshot: t.nameSnapshot,
        templateName: t.templateItem?.name ?? t.nameSnapshot,
      },
      score,
    }
  })
  scored.sort((a, b) => b.score - a.score)
  const top = scored[0]
  return top && top.score > 0 ? top.task : null
}

/** Parse relative date string to ISO date (YYYY-MM-DD). */
export function parseRelativeDate(dateFragment: string): string | null {
  const s = (dateFragment || "").trim().toLowerCase()
  if (!s) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const nextMatch = s.match(/next\s+(\w+)/)
  if (nextMatch) {
    const day = weekdays.find((d) => d.startsWith(nextMatch[1]))
    if (day) {
      const target = new Date(today)
      const todayDow = target.getDay()
      const targetDow = weekdays.indexOf(day)
      let diff = targetDow - todayDow
      if (diff <= 0) diff += 7
      target.setDate(target.getDate() + diff)
      return target.toISOString().slice(0, 10)
    }
  }

  if (s === "tomorrow") {
    const t = new Date(today)
    t.setDate(t.getDate() + 1)
    return t.toISOString().slice(0, 10)
  }

  const dayOnly = weekdays.find((d) => d.startsWith(s))
  if (dayOnly) {
    const target = new Date(today)
    const todayDow = target.getDay()
    const targetDow = weekdays.indexOf(dayOnly)
    let diff = targetDow - todayDow
    if (diff <= 0) diff += 7
    target.setDate(target.getDate() + diff)
    return target.toISOString().slice(0, 10)
  }

  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0)
    return parsed.toISOString().slice(0, 10)
  }
  return null
}

/** Get contractor id/name for company (optional: match by name fragment). */
export async function resolveContractor(
  companyId: string,
  contractorFragment?: string
): Promise<{ id: string; companyName: string } | null> {
  const contractors = await prisma.contractor.findMany({
    where: { companyId },
    select: { id: true, companyName: true },
  })
  if (!contractorFragment) return contractors[0] ?? null
  const needle = norm(contractorFragment)
  const match = contractors.find((c) => norm(c.companyName).includes(needle))
  return match ?? contractors[0] ?? null
}

/** Find a task suitable for adding punch items (e.g. gate task or "punch" named). */
export async function resolvePunchlistTask(
  homeId: string,
  companyId: string
): Promise<{ id: string; nameSnapshot: string } | null> {
  const tasks = await prisma.homeTask.findMany({
    where: {
      homeId,
      OR: [{ companyId }, { companyId: null, home: { companyId } }],
    },
    include: {
      templateItem: { select: { name: true, isCriticalGate: true } },
    },
    orderBy: { sortOrderSnapshot: "asc" },
  })
  const punchLike = tasks.find(
    (t) =>
      /punch|final|inspection/i.test(t.nameSnapshot) ||
      (t.templateItem?.name && /punch|final|inspection/i.test(t.templateItem.name))
  )
  if (punchLike) return { id: punchLike.id, nameSnapshot: punchLike.nameSnapshot }
  const gate = tasks.find((t) => t.templateItem?.isCriticalGate)
  if (gate) return { id: gate.id, nameSnapshot: gate.nameSnapshot }
  return tasks.length > 0
    ? { id: tasks[tasks.length - 1].id, nameSnapshot: tasks[tasks.length - 1].nameSnapshot }
    : null
}
