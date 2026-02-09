"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown } from "lucide-react"

export interface KPIItem {
  label: string
  value: string
  delta?: "up" | "down" | null
}

export interface KPIGridProps {
  kpis: KPIItem[]
}

export function KPIGrid({ kpis }: KPIGridProps) {
  return (
    <Card className="rounded-2xl border-[#E6E8EF] bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">KPI Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="flex min-h-[56px] flex-col justify-center rounded-xl border border-[#E6E8EF] bg-[#F6F7F9]/50 px-4 py-3"
            >
              <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
              <div className="mt-0.5 flex items-center gap-1">
                <span className="text-sm font-semibold">{kpi.value}</span>
                {kpi.delta === "up" && (
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" aria-hidden />
                )}
                {kpi.delta === "down" && (
                  <TrendingDown className="h-3.5 w-3.5 text-red-600" aria-hidden />
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
