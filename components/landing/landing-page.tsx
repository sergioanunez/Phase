import Link from "next/link"
import { Calendar, MessageSquare, Workflow, Eye, Smartphone, Layers } from "lucide-react"
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
                <p className="mt-2 text-sm text-gray-500">Upgrade anytime. No per-seat pricing.</p>
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
        <section id="problem" className={`${SECTION_CLASS} bg-gray-100/90`}>
          <div className="mx-auto max-w-3xl">
            <p className="text-lg font-semibold text-gray-900">
              Most builders don&apos;t have a scheduling problem.<br />
              They have an execution problem.
            </p>
            <h2 className="mt-8 text-2xl font-bold text-gray-900 sm:text-3xl">
              Why builds slow down
            </h2>
            <p className="mt-4 text-base text-gray-700 sm:text-lg">
              When scheduling lives in texts, spreadsheets, and memory, it breaks quickly.
            </p>
            <ul className="mt-6 space-y-3 sm:space-y-4">
              <li className="flex gap-3 text-gray-700 sm:text-base">
                <span className="text-gray-500 shrink-0">•</span>
                <span>Subs miss work or say they weren&apos;t notified</span>
              </li>
              <li className="flex gap-3 text-gray-700 sm:text-base">
                <span className="text-gray-500 shrink-0">•</span>
                <span>Materials get ordered too late</span>
              </li>
              <li className="flex gap-3 text-gray-700 sm:text-base">
                <span className="text-gray-500 shrink-0">•</span>
                <span>Punchlists disappear inside text threads</span>
              </li>
              <li className="flex gap-3 text-gray-700 sm:text-base">
                <span className="text-gray-500 shrink-0">•</span>
                <span>Delays appear only after the schedule slips</span>
              </li>
            </ul>
            <div className="mt-10 space-y-3 rounded-lg border border-gray-200 bg-white px-4 py-5 sm:px-6 sm:py-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                What this creates
              </p>
              <p className="text-base font-semibold text-gray-900">Longer build cycles.</p>
              <p className="text-base font-semibold text-gray-900">Overloaded superintendents.</p>
              <p className="text-base font-semibold text-gray-900">Reactive management instead of controlled execution.</p>
            </div>
          </div>
        </section>

        {/* How We Solve It – three pillars */}
        <section id="solution" className={SECTION_CLASS}>
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

        {/* Credibility: Built by Builders */}
        <section
          id="why-phase"
          className={`${SECTION_CLASS} bg-gray-50/80`}
          aria-labelledby="built-by-builders-heading"
        >
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <h2
                id="built-by-builders-heading"
                className="text-2xl font-bold text-gray-900 sm:text-3xl"
              >
                Built by Builders for Real Field Execution
              </h2>
              <p className="mt-4 text-base text-gray-700 sm:text-lg">
                Phase is designed for the way home builders actually coordinate projects in the field.
              </p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
              {[
                {
                  title: "Schedules tied to real progress",
                  desc: "Build schedules follow task dependencies and update based on real field activity, not static paperwork.",
                  Icon: Workflow,
                },
                {
                  title: "Live visibility across homes",
                  desc: "Managers can see where every home stands in the pipeline and where delays are forming.",
                  Icon: Eye,
                },
                {
                  title: "Field-first design",
                  desc: "Phase is built to work on phones and tablets so teams can coordinate work from the field, not just the office.",
                  Icon: Smartphone,
                },
                {
                  title: "One system for field execution",
                  desc: "Schedules, contractors, punchlists, and inspections live in one operational workflow.",
                  Icon: Layers,
                },
              ].map(({ title, desc, Icon }) => (
                <article
                  key={title}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:outline-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <h3 className="text-base font-semibold text-gray-900">
                      {title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm text-gray-700 sm:text-base">
                    {desc}
                  </p>
                </article>
              ))}
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
