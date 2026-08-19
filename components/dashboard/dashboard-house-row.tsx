"use client"

import Link from "next/link"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { houseDetailsHref, type DashboardDrilldownKind, type DashboardHouseRowData } from "@/lib/dashboard/drilldown"

function formatShort(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return format(d, "MMM d")
}

export function DashboardHouseRow({
  house,
  kind,
}: {
  house: DashboardHouseRowData
  kind: DashboardDrilldownKind
}) {
  const taskId = kind === "pulse" ? null : house.nextCriticalTaskId
  const href = houseDetailsHref(house.homeId, taskId)

  const start = formatShort(house.startDate)
  const forecast = formatShort(house.forecastDate)
  const target = formatShort(house.targetDate)
  const milestoneDate = formatShort(house.lastMilestoneCompletedAt)

  return (
    <Link
      href={href}
      className={cn(
        "block min-w-0 rounded-xl border border-[#E6E8EF] bg-white px-3 py-3 text-left",
        "transition-colors hover:bg-[#F6F7F9] focus:outline-none focus:ring-2 focus:ring-primary/20"
      )}
    >
      <p className="truncate text-sm font-semibold text-foreground">{house.address}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{house.subdivisionName}</p>

      {kind === "portfolio" && house.status === "not_started" && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {start ? `Start: ${start}` : "No start date"}
        </p>
      )}

      {kind === "portfolio" && house.status === "behind" && house.daysBehind != null && (
        <p className="mt-1.5 text-xs font-medium text-red-700">
          {house.daysBehind} day{house.daysBehind === 1 ? "" : "s"} behind
        </p>
      )}

      {kind === "portfolio" && house.status && house.status !== "not_started" && (
        <p className="mt-1 text-xs text-muted-foreground">
          Forecast {forecast ?? "—"} · Target {target ?? "—"}
        </p>
      )}

      {kind === "portfolio" && house.status === "at_risk" && house.daysBehind != null && (
        <p className="mt-0.5 text-xs text-amber-800">
          Forecast {house.daysBehind} day{house.daysBehind === 1 ? "" : "s"} after target
        </p>
      )}

      {kind === "timeline" && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Forecast: {forecast ?? "—"}
        </p>
      )}

      {kind === "pulse" && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Last milestone:{" "}
          {house.lastMilestoneName
            ? `${house.lastMilestoneName}${milestoneDate ? ` · ${milestoneDate}` : ""}`
            : "—"}
        </p>
      )}

      {(kind === "portfolio" || kind === "timeline" || kind === "pulse") &&
        house.nextCriticalTaskName && (
          <p className="mt-1 min-w-0 text-xs text-foreground">
            <span className="text-muted-foreground">
              {kind === "timeline" ? "Current critical:" : "Next critical:"}
            </span>{" "}
            <span className="break-words">{house.nextCriticalTaskName}</span>
          </p>
        )}
    </Link>
  )
}
