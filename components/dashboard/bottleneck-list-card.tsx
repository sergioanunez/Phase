"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, ChevronRight } from "lucide-react"
import Link from "next/link"

export interface BottleneckItem {
  key: string
  label: string
  count: number
}

export interface BottleneckListCardProps {
  bottlenecks: BottleneckItem[]
}

export function BottleneckListCard({ bottlenecks }: BottleneckListCardProps) {
  const displayList = bottlenecks.slice(0, 6)

  return (
    <Card className="rounded-2xl border-[#E6E8EF] bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Top Bottlenecks This Week</CardTitle>
      </CardHeader>
      <CardContent>
        {displayList.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No bottlenecks this week
          </p>
        ) : (
          <ul className="space-y-1">
            {displayList.map((item) => (
              <li key={item.key}>
                <Link
                  href={`/homes?bottleneck=${encodeURIComponent(item.key)}`}
                  className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/50"
                >
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  <span className="text-sm text-muted-foreground">{item.count} homes</span>
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
