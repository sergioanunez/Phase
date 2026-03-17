import Link from "next/link"
import { Calendar, MessageSquare, Workflow, Eye, Smartphone, Layers, AlertCircle, Package, FileText, TrendingDown, AlertTriangle } from "lucide-react"
import { LandingNav } from "./landing-nav"
import { LandingFooter } from "./landing-footer"
import { PricingSection } from "./pricing-section"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const SECTION_CLASS = "mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
const CARD_CLASS =
  "rounded-2xl border border-[#E6E8EF] bg-white p-6 shadow-sm sm:p-8"

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <LandingNav />

      <main>
        {/* Hero */}
        <section className={`${SECTION_CLASS} pt-14 sm:pt-20 pb-12`}>
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-center">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                Keep Your Builds Moving.
              </h1>
              <p className="mt-6 text-lg text-gray-600 sm:text-xl max-w-xl">
                Reduce build cycle time through better execution, communication, and visibility.
              </p>
              <p className="mt-2 text-base font-medium text-gray-700 sm:text-lg">
                Your field operating system.
              </p>
              <div className="mt-10">
                <Link
                  href="/start-trial"
                  className="min-h-[48px] shrink-0 inline-flex items-center justify-center rounded-xl bg-[#2563eb] px-6 text-base font-semibold text-white hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2 whitespace-nowrap"
                >
                  Start 30-Days Free Trial
                </Link>
                <p className="mt-2 text-sm text-gray-500">No credit card needed. No per-seat pricing.</p>
              </div>
            </div>
            <div className="relative">
              <div className={`${CARD_CLASS} space-y-4`}>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                  <Calendar className="h-4 w-4" />
                  This week
                </div>
                <div className="space-y-2">
                  {["Foundation — Mon", "Rough Plumbing — Tue", "Framing — Wed"].map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 text-sm"
                    >
                      <span className="font-medium text-gray-900">{t}</span>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Confirmed
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  SMS sent • 3 confirmed
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div className="h-2 w-2/3 rounded-full bg-[#2563eb]" style={{ width: "66%" }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The Problem */}
        <section id="problem" className={`${SECTION_CLASS} bg-gray-100/90 pb-12 sm:pb-16`}>
          <div className="mx-auto max-w-3xl">
            <div className="flex gap-3">
              <div className="h-1 w-10 shrink-0 rounded-full bg-amber-400/80 mt-1.5" aria-hidden />
              <p className="text-lg font-semibold text-gray-900">
                Most builders don&apos;t have a scheduling problem.<br />
                They have an execution problem.
              </p>
            </div>
            <h2 className="mt-8 text-2xl font-bold text-gray-900 sm:text-3xl">
              Why builds slow down
            </h2>
            <p className="mt-4 text-base text-gray-700 sm:text-lg">
              When scheduling lives in texts, spreadsheets, and memory, it breaks quickly.
            </p>
            <ul className="mt-6 space-y-3 sm:space-y-4" role="list">
              <li className="flex gap-3 text-gray-700 sm:text-base">
                <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-1.5 text-amber-700" aria-hidden>
                  <AlertCircle className="h-4 w-4" />
                </span>
                <span>Subs miss work or say they weren&apos;t notified</span>
              </li>
              <li className="flex gap-3 text-gray-700 sm:text-base">
                <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-1.5 text-amber-700" aria-hidden>
                  <Package className="h-4 w-4" />
                </span>
                <span>Materials get ordered too late</span>
              </li>
              <li className="flex gap-3 text-gray-700 sm:text-base">
                <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-1.5 text-amber-700" aria-hidden>
                  <FileText className="h-4 w-4" />
                </span>
                <span>Punchlists disappear inside text threads</span>
              </li>
              <li className="flex gap-3 text-gray-700 sm:text-base">
                <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-1.5 text-amber-700" aria-hidden>
                  <TrendingDown className="h-4 w-4" />
                </span>
                <span>Delays appear only after the schedule slips</span>
              </li>
            </ul>
            <div className="mt-10 flex gap-4 rounded-xl border border-gray-200 border-l-4 border-l-amber-500/80 bg-white px-4 py-5 shadow-sm sm:px-6 sm:py-6">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" aria-hidden />
              <div className="space-y-3 min-w-0">
                <p className="text-sm font-semibold uppercase tracking-wide text-amber-800/90">
                  What this creates
                </p>
                <p className="text-base font-semibold text-gray-900">Longer build cycles.</p>
                <p className="text-base font-semibold text-gray-900">Overloaded superintendents.</p>
                <p className="text-base font-semibold text-gray-900">Reactive management instead of controlled execution.</p>
              </div>
            </div>
          </div>
        </section>

        {/* How We Solve It – three pillars */}
        <section id="solution" className={`${SECTION_CLASS} pt-12 sm:pt-16`}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              A System That Controls the Field
            </h2>
            <p className="mt-4 text-base text-gray-600 sm:text-lg max-w-2xl">
              Phase organizes construction operations into three layers.
            </p>
            <p className="mt-6 text-base text-gray-600">
              Execution. Communication. Visibility.
            </p>

            {/* Pillar: Execution */}
            <div className="mt-14 first:mt-10">
              <div className="h-0.5 w-12 sm:w-16 rounded-full bg-blue-200/80" aria-hidden />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-blue-700/90">
                Execution
              </p>
              <p className="mt-1 text-base text-gray-700">
                Keep builds moving in the right order.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-semibold text-gray-900">Flow Mode</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Daily action feed showing exactly what must happen next to keep builds moving.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">Gates &amp; Blocking</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Tasks cannot start until prerequisite work is completed.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">Critical Path Forecasting</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Predict completion dates based on task dependencies and sequencing.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">Plans Viewer</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Access construction plans directly inside the system while managing work.
                  </p>
                </div>
              </div>
            </div>

            {/* Pillar: Communication */}
            <div className="mt-14">
              <div className="h-0.5 w-12 sm:w-16 rounded-full bg-blue-200/80" aria-hidden />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-blue-700/90">
                Communication
              </p>
              <p className="mt-1 text-base text-gray-700">
                Coordinate subcontractors and field teams without scattered messages.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">SMS Confirmations</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Send schedules to trades and receive confirmations instantly.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">Smart Notifications</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Automatic alerts when work is scheduled, confirmed, or delayed.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">Subcontractor Panel</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Trades see only their tasks, punch lists, and schedule.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">Punch Lists</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Create, assign, and track punch list items with clear ownership.
                  </p>
                </div>
              </div>
            </div>

            {/* Pillar: Visibility */}
            <div className="mt-14">
              <div className="h-0.5 w-12 sm:w-16 rounded-full bg-blue-200/80" aria-hidden />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-blue-700/90">
                Visibility
              </p>
              <p className="mt-1 text-base text-gray-700">
                See where every build stands and where risk is forming.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">Management Dashboard</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    See schedule health and progress across all active homes.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">AI Risk &amp; Schedule Insights</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Identify delay risks and sequencing issues before they impact the schedule.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">Live Calendar</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Visualize every home, every task, and every dependency.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                  <p className="text-sm font-medium text-gray-800">Forecast &amp; KPI visibility</p>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                    Track cycle time, delays, and key construction performance metrics.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-12 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-base font-medium text-gray-800">Everything lives in one place.</p>
              <p className="mt-1 text-base text-gray-700">No spreadsheets. No scattered messages. No guesswork.</p>
            </div>
          </div>
        </section>

        {/* How Phase Works */}
        <section className={`${SECTION_CLASS} bg-[#EFF3FB] pt-12 sm:pt-16`}>
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              How Phase Works
            </h2>
            <p className="mt-3 text-base text-gray-600 sm:text-lg max-w-2xl mx-auto">
              From scheduling to execution, Phase connects your entire operation in one system.
            </p>
          </div>

          <div className="relative mx-auto mt-10 max-w-6xl">
            {/* Desktop process rail */}
            <div
              className="pointer-events-none absolute inset-x-6 top-1/2 hidden h-px bg-gradient-to-r from-blue-100 via-blue-200/80 to-blue-100 lg:block"
              aria-hidden
            />
            <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {/* Step 01 */}
              <article className="relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white px-4 py-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1">
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-blue-700">
                      01
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-blue-700/80">
                      Schedule
                    </span>
                  </div>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Calendar className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-4 text-left">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Schedule the Work
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Assign tasks to homes and subcontractors using your build template.
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-gray-600">
                    <li className="flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-200" aria-hidden />
                      <span>Dependencies stay enforced</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-200" aria-hidden />
                      <span>Every home follows the plan</span>
                    </li>
                  </ul>
                </div>
              </article>

              {/* Step 02 */}
              <article className="relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white px-4 py-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1">
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-blue-700">
                      02
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-blue-700/80">
                      Confirm
                    </span>
                  </div>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-4 text-left">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Trades Confirm Instantly
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Subcontractors receive schedules by SMS and confirm availability.
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-gray-600">
                    <li className="flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-200" aria-hidden />
                      <span>No missed work</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-200" aria-hidden />
                      <span>No “I didn’t know”</span>
                    </li>
                  </ul>
                </div>
              </article>

              {/* Step 03 */}
              <article className="relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white px-4 py-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1">
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-blue-700">
                      03
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-blue-700/80">
                      Execute
                    </span>
                  </div>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Workflow className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-4 text-left">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Execute with Clarity
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Flow Mode shows exactly what needs to happen next.
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-gray-600">
                    <li className="flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-200" aria-hidden />
                      <span>Daily action feed by home</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-200" aria-hidden />
                      <span>Less guesswork in the field</span>
                    </li>
                  </ul>
                </div>
              </article>

              {/* Step 04 */}
              <article className="relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white px-4 py-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1">
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-blue-700">
                      04
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-blue-700/80">
                      Monitor
                    </span>
                  </div>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-4 text-left">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Monitor &amp; Stay Ahead
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Track progress, forecast completion, and catch risks early.
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-gray-600">
                    <li className="flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-200" aria-hidden />
                      <span>Real-time dashboard</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-200" aria-hidden />
                      <span>Early visibility into delays</span>
                    </li>
                  </ul>
                </div>
              </article>
            </div>

          </div>
        </section>

        {/* Built for Real Field Execution */}
        <section
          id="why-phase"
          className={`${SECTION_CLASS} bg-[#F7F8FC]`}
          aria-labelledby="built-for-field-heading"
        >
          <div className="mx-auto max-w-6xl grid gap-10 lg:grid-cols-2 lg:items-center">
            {/* Left: copy */}
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700/80">
                Built for the field
              </p>
              <h2
                id="built-for-field-heading"
                className="text-2xl font-bold text-gray-900 sm:text-3xl"
              >
                Built for Real Field Execution
              </h2>
              <p className="text-base text-gray-700 sm:text-lg">
                Phase was designed for the realities of residential construction:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-gray-800 sm:text-base">
                {[
                  "crews working simultaneously across multiple homes",
                  "schedules that change daily",
                  "coordinating multiple subcontractors and vendors",
                  "real-time decisions made in the field",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-300" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="pt-3 text-base font-semibold text-gray-900">
                Simple enough to use on any phone or tablet
              </p>
            </div>

            {/* Right: illustrative mini cards */}
            <div
              className="relative mx-auto flex max-w-md flex-col gap-3"
              aria-hidden="true"
            >
              <div className="pointer-events-none absolute inset-x-6 top-6 h-40 rounded-3xl bg-gradient-to-b from-blue-50/60 via-white to-transparent shadow-[0_24px_40px_rgba(15,23,42,0.12)]" />

              <div className="relative space-y-3">
                <div className="rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-gray-500">
                        Active framing
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        4 homes in structural phase
                      </p>
                    </div>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                      <Layers className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    Crews distributed across lots with shared subs.
                  </p>
                </div>

                <div className="ml-6 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-amber-700">
                        Schedule change
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        Concrete pushed by 1 day
                      </p>
                    </div>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                      <Calendar className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    Downstream tasks and trades updated automatically.
                  </p>
                </div>

                <div className="-ml-2 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-emerald-700">
                        Field confirmation
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        Concrete crew confirmed
                      </p>
                    </div>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    SMS reply recorded, schedule locked for tomorrow.
                  </p>
                </div>

                <div className="ml-10 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-sky-700">
                        Upcoming inspection
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        Final walk-through in 2 days
                      </p>
                    </div>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                      <Eye className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    Punch items and prerequisites surfaced ahead of time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <PricingSection />

        {/* White Label */}
        <section id="white-label" className={`${SECTION_CLASS} bg-gray-50/80`}>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Branded Experience — +$99/month
            </h2>
            <p className="mt-4 text-base text-gray-700 sm:text-lg">
              Make Phase feel like your own internal system.
            </p>
            <ul className="mt-6 space-y-2 text-gray-700">
              <li className="flex gap-2">• Your logo on login and dashboard</li>
              <li className="flex gap-2">• Your primary brand color across the platform</li>
              <li className="flex gap-2">• A unified experience for your team and subcontractors</li>
            </ul>
            <p className="mt-6 text-sm text-gray-600">Available on any plan.</p>
          </div>
        </section>

        {/* Custom Development */}
        <section id="custom" className={SECTION_CLASS}>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Need More Than Software?
            </h2>
            <p className="mt-4 text-base text-gray-700 sm:text-lg">
              For builders scaling operations or formalizing franchise systems, we offer tailored development:
            </p>
            <ul className="mt-6 space-y-2 text-gray-700">
              <li className="flex gap-2">• Custom workflow logic</li>
              <li className="flex gap-2">• Specialized reporting</li>
              <li className="flex gap-2">• Operational automation</li>
              <li className="flex gap-2">• Internal integrations</li>
            </ul>
            <p className="mt-6 text-base font-medium text-gray-900">
              This is system engineering, not a feature add-on.
            </p>
            <div className="mt-8">
              <Link
                href="/contact"
                className="min-h-[48px] inline-flex items-center justify-center rounded-xl border-2 border-gray-800 bg-transparent px-6 text-base font-semibold text-gray-800 hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-800 focus:ring-offset-2"
              >
                Request a Custom Quote
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={SECTION_CLASS}>
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            FAQ
          </h2>
          <Accordion type="single" collapsible className="mt-10">
            {[
              { q: "Is Phase only for large builders?", a: "No. It works for small teams and scaling operations alike." },
              { q: "Do subcontractors need to pay?", a: "No. Subcontractor access is included in every plan." },
              { q: "Do I pay per superintendent or user?", a: "No per-seat pricing. Add your entire team." },
              { q: "Is this just a task manager?", a: "No. Phase enforces sequencing, dependencies, and forecast logic." },
              { q: "Will my subcontractors use it?", a: "Yes. They see only their tasks, calendar, and punch lists." },
              { q: "Is there a contract?", a: "No long-term contracts. Start with a 30-day free trial." },
            ].map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-gray-600">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Final CTA */}
        <section className={`${SECTION_CLASS} bg-white`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Run Your Field Like a System.
            </h2>
            <div className="mt-6 space-y-2 text-base text-gray-700">
              <p>When execution improves, cycle time improves.</p>
              <p>When visibility improves, stress decreases.</p>
              <p>When coordination improves, builds move faster.</p>
            </div>
            <p className="mt-6 text-lg font-semibold text-gray-900">
              Stop managing around the chaos.<br />
              Start operating with discipline.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/start-trial"
                className="min-h-[48px] inline-flex items-center justify-center rounded-xl bg-[#2563eb] px-6 text-base font-semibold text-white hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2"
              >
                Start Your 30-Day Free Trial
              </Link>
              <Link
                href="/auth/signin"
                className="min-h-[48px] inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
              >
                Login Area
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              All features included. Upgrade anytime.<br />
              Keep your builds moving.
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
