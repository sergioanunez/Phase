import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { PricingScaleSelector } from "./PricingScaleSelector"

const SECTION_CLASS = "mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"

export function PricingSection() {
  const [showWhyPhase, setShowWhyPhase] = useState(false)

  return (
    <section id="pricing" className={`${SECTION_CLASS} bg-white pb-0`}>
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Simple pricing that scales with your builds.
        </h2>
        <p className="mt-4 text-lg text-gray-600">
          You only pay for active homes. All features are included.
        </p>
        <ul className="mt-6 flex flex-col items-center gap-1.5 text-sm text-gray-600">
          <li className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-xs">
              ✓
            </span>
            <span>No per-seat fees.</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-xs">
              ✓
            </span>
            <span>No subcontractor fees.</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-xs">
              ✓
            </span>
            <span>No locked features.</span>
          </li>
        </ul>

        {/* Collapsible comparison: why builders choose Phase */}
        <div className="mx-auto mt-6 max-w-3xl">
          <button
            type="button"
            onClick={() => setShowWhyPhase((open) => !open)}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-800 hover:underline underline-offset-4 cursor-pointer"
            aria-expanded={showWhyPhase}
          >
            <span>Why builders choose Phase</span>
            <ChevronDown
              className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
                showWhyPhase ? "rotate-180" : "rotate-0"
              }`}
              aria-hidden
            />
          </button>

          <div
            className={`mt-5 overflow-hidden rounded-xl border border-black/5 bg-[#f8f9fb] p-6 text-left transition-all duration-200 ease-out ${
              showWhyPhase ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
            }`}
            aria-hidden={!showWhyPhase}
          >
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-gray-900 sm:text-base">
                  Built for execution in the field
                </p>
                <ul className="mt-3 space-y-2 text-sm text-gray-700">
                  <li>Pay per active home</li>
                  <li>No per-seat fees</li>
                  <li>No subcontractor fees</li>
                  <li>All features included</li>
                  <li>Start instantly — no demo required</li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 sm:text-base">
                  Built for planning and documentation
                </p>
                <ul className="mt-3 space-y-2 text-sm text-gray-700">
                  <li>Per-user pricing</li>
                  <li>Additional cost for subcontractors</li>
                  <li>Feature-based pricing tiers</li>
                  <li>Complex setup and onboarding</li>
                  <li>&quot;Request a demo&quot; to get started</li>
                </ul>
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-gray-500 sm:text-sm">
              What you don&apos;t pay for matters.
            </p>
          </div>
        </div>
      </div>

      {/* Scale Selector – main anchor */}
      <div className="mt-10 flex justify-center">
        <div className="w-full max-w-2xl">
          <PricingScaleSelector />
        </div>
      </div>
    </section>
  )
}
