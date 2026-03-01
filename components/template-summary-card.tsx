import { Layers } from "lucide-react"

interface TemplateSummaryCardProps {
  totalWorkingDays: number
  totalWorkItems: number
  categoryCount: number
  infoTitle?: string
}

export function TemplateSummaryCard({
  totalWorkingDays,
  totalWorkItems,
  categoryCount,
  infoTitle = "This is the sum of all template task durations. Actual forecast duration may differ based on dependencies.",
}: TemplateSummaryCardProps) {
  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-4 sm:px-5 sm:py-5 dark:border-gray-700 dark:bg-gray-900/30">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Template Summary
          </h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-6 sm:text-right">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100" title={infoTitle}>
            Total Build Time: {totalWorkingDays} working days
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {totalWorkItems} work items · {categoryCount} categories
          </p>
        </div>
      </div>
    </div>
  )
}
