"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClipboardCheck, ChevronRight } from "lucide-react"
import Link from "next/link"

export interface InspectionItem {
  type: string
  count: number
}

export interface UpcomingInspectionsCardProps {
  inspectionsUpcoming: InspectionItem[]
}

export function UpcomingInspectionsCard({
  inspectionsUpcoming,
}: UpcomingInspectionsCardProps) {
  return (
    <Card className="rounded-2xl border-[#E6E8EF] bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Upcoming Inspections</CardTitle>
        <p className="text-sm text-muted-foreground">Next 7–10 days</p>
      </CardHeader>
      <CardContent>
        {inspectionsUpcoming.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No upcoming inspections
          </p>
        ) : (
          <ul className="space-y-1">
            {inspectionsUpcoming.map((item) => (
              <li key={item.type}>
                <Link
                  href={`/calendar?inspection=${encodeURIComponent(item.type)}`}
                  className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/50"
                >
                  <ClipboardCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium">{item.type}</span>
                  <span className="text-sm text-muted-foreground">{item.count}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
