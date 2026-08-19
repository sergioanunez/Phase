"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusSegmentChips } from "./status-segment-chips"
import Link from "next/link"
import { CountUpNumber } from "./count-up-number"
import type { ScheduleStatus } from "@/lib/schedule-status"

export interface PortfolioOverviewCardProps {
  activeHomesCount: number
  statusCounts: { notStarted: number; onTrack: number; atRisk: number; behind: number }
  onStatusSelect?: (status: ScheduleStatus, count: number) => void
}

export function PortfolioOverviewCard({
  activeHomesCount,
  statusCounts,
  onStatusSelect,
}: PortfolioOverviewCardProps) {
  return (
    <Card className="rounded-2xl border-[#E6E8EF] bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Portfolio Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Active Homes:{" "}
          <CountUpNumber
            value={activeHomesCount}
            className="font-semibold text-foreground tabular-nums"
          />
        </p>
        <StatusSegmentChips statusCounts={statusCounts} onStatusSelect={onStatusSelect} />
        <Link
          href="/homes"
          className="inline-block text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          View all homes
        </Link>
      </CardContent>
    </Card>
  )
}
