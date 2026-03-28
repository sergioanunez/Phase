import type { Metadata } from "next"
import { Suspense } from "react"
import { DelayCostCalculatorPage } from "@/components/tools/delay-cost-calculator-page"

export const metadata: Metadata = {
  title: "Delay Cost Calculator for Homebuilders | Phase",
  description:
    "Estimate what every day of delay is costing on a home build, including financing, overhead, and holding costs.",
  openGraph: {
    title: "Delay Cost Calculator for Homebuilders | Phase",
    description:
      "Estimate what every day of delay is costing on a home build, including financing, overhead, and holding costs.",
  },
}

export default function DelayCostCalculatorRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F7F9]" aria-busy="true" aria-label="Loading calculator" />
      }
    >
      <DelayCostCalculatorPage />
    </Suspense>
  )
}
