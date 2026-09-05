"use client"

import { Check, AlertTriangle, XCircle, Circle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ScheduleStatus } from "@/lib/schedule-status"

export type { ScheduleStatus }

const config: Record<
  ScheduleStatus,
  { label: string; icon: typeof Check; className: string }
> = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-green-600 text-white border-transparent",
  },
  not_started: {
    label: "Not started",
    icon: Circle,
    className: "bg-gray-100 text-gray-600 border border-gray-200",
  },
  on_track: {
    label: "On Track",
    icon: Check,
    className: "bg-green-500 text-white border-transparent",
  },
  at_risk: {
    label: "At Risk",
    icon: AlertTriangle,
    className: "bg-amber-500 text-white border-transparent",
  },
  behind: {
    label: "Behind",
    icon: XCircle,
    className: "bg-red-500 text-white border-transparent",
  },
}

export interface StatusPillProps {
  status: ScheduleStatus
  className?: string
}

export function StatusPill({ status, className }: StatusPillProps) {
  const { label, icon: Icon, className: variantClass } = config[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
        variantClass,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}
