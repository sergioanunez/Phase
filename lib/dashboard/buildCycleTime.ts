import { prisma } from "@/lib/prisma"
import { workingDaysBetween } from "@/lib/forecast"

export type BuildCycleTimeKpi = {
  averageWorkingDays: number | null
  bestWorkingDays: number | null
  worstWorkingDays: number | null
  homesConsidered: number
}

function startOfDay(d: Date | null): Date | null {
  if (!d) return null
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

export async function getBuildCycleTimeKpi(tenantId: string): Promise<BuildCycleTimeKpi> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  ninetyDaysAgo.setHours(0, 0, 0, 0)

  const homes = await prisma.home.findMany({
    where: {
      companyId: tenantId,
      isComplete: true,
      completedAt: { gte: ninetyDaysAgo },
    },
    select: {
      id: true,
      createdAt: true,
      startDate: true,
      completedAt: true,
      tasks: {
        select: {
          completedAt: true,
        },
      },
    },
  })

  const cycleTimes: number[] = []

  for (const home of homes) {
    const taskCompletedDates = home.tasks
      .map((t) => (t.completedAt ? new Date(t.completedAt) : null))
      .filter((d): d is Date => d != null)

    const start =
      (taskCompletedDates.length > 0
        ? startOfDay(new Date(Math.min(...taskCompletedDates.map((d) => d.getTime()))))
        : null) ??
      startOfDay(home.startDate) ??
      startOfDay(home.createdAt)

    const completion =
      startOfDay(home.completedAt) ??
      (taskCompletedDates.length > 0
        ? startOfDay(new Date(Math.max(...taskCompletedDates.map((d) => d.getTime()))))
        : null)

    if (!start || !completion) continue
    if (completion <= start) continue

    const wd = workingDaysBetween(start, completion)
    if (wd <= 0) continue
    cycleTimes.push(wd)
  }

  if (cycleTimes.length === 0) {
    return {
      averageWorkingDays: null,
      bestWorkingDays: null,
      worstWorkingDays: null,
      homesConsidered: 0,
    }
  }

  const total = cycleTimes.reduce((sum, v) => sum + v, 0)
  const averageWorkingDays = Math.round(total / cycleTimes.length)
  const bestWorkingDays = Math.min(...cycleTimes)
  const worstWorkingDays = Math.max(...cycleTimes)

  return {
    averageWorkingDays,
    bestWorkingDays,
    worstWorkingDays,
    homesConsidered: cycleTimes.length,
  }
}

