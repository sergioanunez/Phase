import { PricingScaleSelector } from "./PricingScaleSelector"

const SECTION_CLASS = "mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"

const ALL_PLANS_GROUPS = [
  {
    label: "Scheduling",
    items: [
      "Master schedules, durations, and dependencies",
      "Task-level notes + photos",
    ],
  },
  {
    label: "Communication",
    items: ["SMS subcontractor confirmations (Y/N)"],
  },
  {
    label: "Oversight",
    items: [
      "Real-time progress and manager visibility",
      "QA / punchlist workflows and critical gates",
      "Role-based access (admin, manager, super, subcontractor)",
      "Reporting and at-risk alerts",
    ],
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className={`${SECTION_CLASS} bg-white pb-0`}>
      <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
        Simple, transparent pricing
      </h2>
      <p className="mt-4 text-lg text-gray-600">
        Every plan includes full access. Pricing changes only with scale.
      </p>
      <ul className="mt-4 list-none space-y-1.5 pl-0 text-sm text-gray-600 leading-relaxed">
        <li>No locked features. No complicated add-ons.</li>
      </ul>
      <p className="mt-3 text-sm text-gray-600">
        Upgrade or downgrade as your volume changes.
      </p>

      {/* All plans include – de-emphasized support block */}
      <div className="mt-8 rounded-xl border border-gray-100 bg-neutral-50/80 py-5 px-5 sm:py-6 sm:px-6 lg:py-8 lg:px-8">
        <h3 className="text-base font-semibold text-gray-700">All plans include</h3>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_PLANS_GROUPS.map((group, gi) => (
            <div key={gi} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {group.label}
              </p>
              <ul className="space-y-1.5 text-sm text-gray-500">
                {group.items.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#2563eb] shrink-0">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Scale Selector – main anchor */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900">Choose by active homes</h3>
        <p className="mt-1 text-sm text-gray-600">
          Full access on every plan. Pricing scales only with the number of active homes you&apos;re building.
        </p>
        <div className="mt-8">
          <PricingScaleSelector />
        </div>
      </div>
    </section>
  )
}
