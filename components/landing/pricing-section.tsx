import { PricingScaleSelector } from "./PricingScaleSelector"

const SECTION_CLASS = "mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"

export function PricingSection() {
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
