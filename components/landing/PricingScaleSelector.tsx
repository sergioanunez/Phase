"use client"

import { useState } from "react"
import Link from "next/link"

type TierId = "starter" | "growth" | "scale"

const TIERS: Array<{
  id: TierId
  name: string
  limit: string
  price: string
  description: string
  popular: boolean
}> = [
  {
    id: "starter",
    name: "Starter",
    limit: "Up to 5 active homes",
    price: "$199/month",
    description: "Ideal for small teams.",
    popular: false,
  },
  {
    id: "growth",
    name: "Growth",
    limit: "Up to 25 active homes",
    price: "$399/month",
    description: "Best for production builders.",
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    limit: "Unlimited active homes",
    price: "$799/month",
    description: "For high-volume operations.",
    popular: false,
  },
]

const TIER_INDEX: Record<TierId, number> = { starter: 0, growth: 1, scale: 2 }

export function PricingScaleSelector() {
  const [selectedTier, setSelectedTier] = useState<TierId>("growth")
  const tier = TIERS.find((t) => t.id === selectedTier) ?? TIERS[1]
  const selectedIndex = TIER_INDEX[selectedTier]

  return (
    <div className="space-y-5">
      {/* Connected stepper: nodes row + labels row */}
      <div className="relative pt-1" role="tablist" aria-label="Select pricing tier">
        {/* Row 1: nodes and connecting line segments */}
        <div className="flex items-center">
          {TIERS.map((t, index) => {
            const isSelected = selectedTier === t.id
            const isLast = index === TIERS.length - 1
            return (
              <div key={t.id} className="flex flex-1 items-center min-w-0">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-label={`${t.name}: ${t.limit}`}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setSelectedTier(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setSelectedTier(t.id)
                    }
                    if (e.key === "ArrowLeft" && index > 0) {
                      e.preventDefault()
                      setSelectedTier(TIERS[index - 1].id)
                    }
                    if (e.key === "ArrowRight" && index < TIERS.length - 1) {
                      e.preventDefault()
                      setSelectedTier(TIERS[index + 1].id)
                    }
                  }}
                  className="group flex flex-col items-center w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 rounded-lg"
                >
                  <span
                    className={`inline-flex shrink-0 rounded-full border-2 transition-all duration-200 ease-out ${
                      isSelected
                        ? "h-6 w-6 border-[#2563eb] bg-[#2563eb] scale-110"
                        : "h-5 w-5 border-gray-300 bg-white group-hover:border-gray-400"
                    }`}
                    aria-hidden
                  />
                  {t.popular && (
                    <span className="mt-1.5 rounded-full bg-[#2563eb] px-2 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap">
                      Most popular
                    </span>
                  )}
                  <span
                    className={`text-center text-sm font-medium transition-colors duration-150 ${
                      isSelected ? "text-gray-900" : "text-gray-600 group-hover:text-gray-900"
                    } ${t.popular ? "mt-1.5" : "mt-2"}`}
                  >
                    {t.name}
                  </span>
                </button>
                {!isLast && (
                  <div
                    className="flex-1 h-0.5 mx-1 sm:mx-2 rounded-full bg-gray-200 overflow-hidden shrink min-w-[8px]"
                    aria-hidden
                  >
                    <div
                      className="h-full bg-[#2563eb] rounded-full transition-all duration-300 ease-out"
                      style={{ width: index < selectedIndex ? "100%" : "0%" }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Single pricing detail panel with transition – visual anchor */}
      <div
        key={tier.id}
        className="animate-pricing-panel-in rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6 sm:py-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h4 className="text-lg font-bold text-gray-900 sm:text-xl">{tier.name}</h4>
            <p className="mt-1 text-sm font-medium text-gray-700">{tier.limit}</p>
            <p className="mt-2 text-sm text-gray-600">{tier.description}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{tier.price}</div>
            <p className="mt-1 text-xs text-gray-500">Billed monthly • No per-user fees</p>
          </div>
        </div>
      </div>

      {/* Single CTA – tight to card, left-aligned */}
      <div className="space-y-1.5">
        <Link
          href="/start-trial"
          className="min-h-[48px] inline-flex w-full items-center justify-center rounded-xl bg-[#2563eb] px-6 text-base font-semibold text-white hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2 sm:w-auto sm:min-w-[200px]"
        >
          Start 30-Day Free Trial
        </Link>
        <p className="text-sm text-gray-500">Start free. Upgrade when your volume grows.</p>
      </div>

      {/* Footnote – muted, close to cluster */}
      <p className="text-xs text-gray-400">
        Active homes = homes currently under construction. Completed homes don&apos;t count.
      </p>
    </div>
  )
}
