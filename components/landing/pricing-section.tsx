import { PricingScaleSelector } from "./PricingScaleSelector"

const SECTION_CLASS = "mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"

export function PricingSection() {
  return (
    <section id="pricing" className={`${SECTION_CLASS} bg-white pb-0`}>
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Simple. Transparent. Scales With You.
        </h2>
        <p className="mt-4 text-lg text-gray-600">
          All features included.
        </p>
        <p className="mt-1 text-base text-gray-600">
          Pricing only scales with the number of active homes.
        </p>
        <ul className="mt-6 list-none space-y-1.5 pl-0 text-sm text-gray-600">
          <li>No per-seat fees.</li>
          <li>No subcontractor fees.</li>
          <li>No locked features.</li>
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
