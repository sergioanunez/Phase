import { prisma } from "@/lib/prisma"
import { diffWorkingDays } from "@/lib/working-days"

export type AverageDelayPerHomeKpi = {
  averageDelayDays: number | null
  homesConsidered: number
  homesBehindCount: number
  homesAheadCount: number
  homesOnTargetCount: number
}

function startOfDay(date: Date | null): Date | null {
  if (!date) return null
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function getAverageDelayPerHomeKpi(tenantId: string): Promise<AverageDelayPerHomeKpi> {
  const homes = await prisma.home.findMany({
    where: {
      companyId: tenantId,
      isComplete: false,
      forecastCompletionDate: { not: null },
      targetCompletionDate: { not: null },
    },
    select: {
      forecastCompletionDate: true,
      targetCompletionDate: true,
    },
  })

  if (homes.length === 0) {
    return {
      averageDelayDays: null,
      homesConsidered: 0,
      homesBehindCount: 0,
      homesAheadCount: 0,
      homesOnTargetCount: 0,
    }
  }

  const delays: number[] = []
  let homesBehindCount = 0
  let homesAheadCount = 0
  let homesOnTargetCount = 0

  for (const home of homes) {
    const target = startOfDay(home.targetCompletionDate)
    const forecast = startOfDay(home.forecastCompletionDate)
    if (!target || !forecast) continue

    const diff = diffWorkingDays(target, forecast)
    delays.push(diff)

    if (diff > 0) homesBehindCount++
    else if (diff < 0) homesAheadCount++
    else homesOnTargetCount++
  }

  if (delays.length === 0) {
    return {
      averageDelayDays: null,
      homesConsidered: 0,
      homesBehindCount: 0,
      homesAheadCount: 0,
      homesOnTargetCount: 0,
    }
  }

  const sum = delays.reduce((acc, v) => acc + v, 0)
  const averageDelayDays = Math.round(sum / delays.length)

  return {
    averageDelayDays,
    homesConsidered: delays.length,
    homesBehindCount,
    homesAheadCount,
    homesOnTargetCount,
  }
}

