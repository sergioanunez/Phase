import Link from "next/link"
import { LandingNav } from "./landing-nav"
import { LandingFooter } from "./landing-footer"
import { PricingSection } from "./pricing-section"
import {
  Calendar,
  MessageSquare,
  LayoutDashboard,
  CheckCircle2,
  ClipboardList,
  Shield,
} from "lucide-react"

const SECTION_CLASS = "mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
const CARD_CLASS =
  "rounded-2xl border border-[#E6E8EF] bg-white p-6 shadow-sm sm:p-8"

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <LandingNav />

      <main>
        {/* Hero */}
        <section className={`${SECTION_CLASS} pt-12 sm:pt-16`}>
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
                Keep your builds moving without chasing people.
              </h1>
              <p className="mt-6 text-lg text-gray-600 sm:text-xl">
                Phase helps homebuilders schedule work, confirm subcontractors by text, and track progress in real time—without spreadsheets or constant calls.
              </p>
              <div className="mt-10">
                <Link
                  href="/start-trial"
                  className="min-h-[48px] shrink-0 inline-flex items-center justify-center rounded-xl bg-[#2563eb] px-6 text-base font-semibold text-white hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2 whitespace-nowrap"
                >
                  Start 30-day free trial
                </Link>
                <p className="mt-2 text-sm text-gray-500">Upgrade or customize anytime</p>
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
        <section id="problem" className={`${SECTION_CLASS} bg-gray-50/80`}>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Scheduling shouldn&apos;t slow your builds down.
            </h2>
            <p className="mt-4 text-base text-gray-700 sm:text-lg">
              When scheduling lives in texts, spreadsheets, and memory, it breaks quickly:
            </p>
            <ul className="mt-6 space-y-3 sm:space-y-4">
              <li className="flex gap-3 text-gray-600 sm:text-base">
                <span className="text-gray-400 shrink-0">•</span>
                <span><strong className="font-semibold text-gray-900">Schedules drift out of sync</strong> within days</span>
              </li>
              <li className="flex gap-3 text-gray-600 sm:text-base">
                <span className="text-gray-400 shrink-0">•</span>
                <span><strong className="font-semibold text-gray-900">Subcontractors miss work</strong> or say they weren&apos;t notified</span>
              </li>
              <li className="flex gap-3 text-gray-600 sm:text-base">
                <span className="text-gray-400 shrink-0">•</span>
                <span><strong className="font-semibold text-gray-900">Superintendents spend too much time</strong> coordinating instead of building</span>
              </li>
              <li className="flex gap-3 text-gray-600 sm:text-base">
                <span className="text-gray-400 shrink-0">•</span>
                <span><strong className="font-semibold text-gray-900">Managers see delays</strong> only after they impact the schedule</span>
              </li>
            </ul>
            <div className="mt-10 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-base font-medium text-gray-800 sm:text-lg">
                Phase centralizes scheduling and automates confirmations—so work moves forward with clarity and accountability.
              </p>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section id="benefits" className={SECTION_CLASS}>
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Why builders use Phase
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: "One schedule, applied across every home",
                body: "A single master schedule drives every job. Changes propagate automatically—no version drift, no outdated spreadsheets.",
                highlight: false,
              },
              {
                title: "Automatic subcontractor confirmations by text",
                body: "Subcontractors confirm by SMS. You see who's committed and who isn't—without chasing.",
                highlight: true,
              },
              {
                title: "Real-time visibility for managers",
                body: "See what's on track and what's behind as it happens. Focus on exceptions, not status meetings.",
                highlight: false,
              },
              {
                title: "Early warning before delays compound",
                body: "Identify risk early and adjust before delays cascade across trades and homes.",
                highlight: true,
              },
            ].map((card, i) => (
              <div
                key={i}
                className={
                  card.highlight
                    ? "rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm sm:p-8"
                    : CARD_CLASS
                }
              >
                <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className={`${SECTION_CLASS} bg-white`}>
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            How it works
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Designed to fit into existing workflows.
          </p>
          <div className="relative mt-10 flex flex-col gap-8 lg:flex-row lg:gap-4">
            <div
              className="absolute top-6 left-[12.5%] right-[12.5%] z-0 hidden h-0.5 bg-gray-300 lg:block"
              aria-hidden="true"
            />
            {[
              { step: 1, title: "Build the schedule once", desc: "Define phases and work items once. Reuse across every home.", highlight: false },
              { step: 2, title: "Supers schedule homes in minutes", desc: "Assign dates and contractors per home—no duplicate data entry.", highlight: true },
              { step: 3, title: "Subcontractors confirm by text", desc: "Subs reply Y/N by SMS. Confirmations update automatically.", highlight: true },
              { step: 4, title: "Managers track by exception", desc: "Dashboards surface what's behind so leaders focus only where needed.", highlight: false },
            ].map((item) => (
              <div key={item.step} className="relative z-10 flex flex-1 flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2563eb] text-lg font-bold text-white">
                  {item.step}
                </div>
                <h3 className={`mt-4 text-gray-900 ${item.highlight ? "font-semibold" : "font-medium text-gray-800"}`}>
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Product Preview / Screens */}
        <section id="screens" className={SECTION_CLASS}>
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Built for the way you work
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Focused views for the field, management, and leadership.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {[
              { icon: ClipboardList, label: "Per-home schedule, always current", desc: "Per-home task list with dates and contractors—always aligned with the master schedule.", highlight: false },
              { icon: CheckCircle2, label: "Confirmations built into every task", desc: "SMS status, confirm/decline, and reschedule—without chasing.", highlight: true },
              { icon: LayoutDashboard, label: "Manager visibility in real time", desc: "On-track vs behind, with exception-based drilldowns.", highlight: false },
              { icon: Shield, label: "Quality gates that prevent rework", desc: "Block progress until critical punchlists are completed and signed off.", highlight: true },
            ].map((item, i) => (
              <div
                key={i}
                className={
                  item.highlight
                    ? "rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm sm:p-8"
                    : CARD_CLASS
                }
              >
                <item.icon className="h-10 w-10 text-primary" />
                <h3 className="mt-4 font-semibold text-gray-900">{item.label}</h3>
                <p className="mt-2 text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <PricingSection />

        {/* Philosophy band */}
        <section className="bg-gray-50 py-10 md:py-14 mt-8">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                Built for real adoption
              </p>
              <p className="text-lg md:text-xl font-semibold text-gray-900 mb-3">
                Built alongside active homebuilding teams.
              </p>
              <div className="space-y-2 text-base text-gray-700">
                <p>Designed for real jobsite adoption.</p>
                <p>Focused on flow, not paperwork.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={SECTION_CLASS}>
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Frequently asked questions
          </h2>
          <dl className="mt-10 space-y-8">
            {[
              {
                q: "Who is Phase for?",
                a: "Homebuilders and production builders who need reliable scheduling, subcontractor confirmations, and manager visibility without spreadsheets or constant calls.",
              },
              {
                q: "Do subcontractors need an app?",
                a: "No. Subcontractors confirm or decline via SMS. They can also use a simple web view (My Schedule) if you invite them.",
              },
              {
                q: "How long does onboarding take?",
                a: "Typically a few days to load your master schedule and homes. We work with you to match your phases and trade names.",
              },
              {
                q: "Can it match our process?",
                a: "Yes. Work items, phases, and contractor assignments are configurable. Critical gates and punch workflows can be modeled to match how you build.",
              },
              {
                q: "Does it replace Procore or Buildertrend?",
                a: "Phase is focused on scheduling and confirmations. It can complement project or ERP tools rather than replace them.",
              },
              {
                q: "How secure is it?",
                a: "Data is stored in a secure cloud. Access is role-based. We follow standard security practices and can discuss compliance if needed.",
              },
              {
                q: "Can we start internal-only?",
                a: "Yes. You can roll out to superintendents and managers first, then add subcontractor SMS and invite when ready.",
              },
            ].map((faq, i) => (
              <div key={i}>
                <dt className="text-base font-semibold text-gray-900">{faq.q}</dt>
                <dd className="mt-2 text-sm text-gray-600">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Final CTA */}
        <section className={`${SECTION_CLASS} bg-white`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              See how Phase would run your builds.
            </h2>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/start-trial"
                className="min-h-[48px] inline-flex items-center justify-center rounded-xl bg-[#2563eb] px-6 text-base font-semibold text-white hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2"
              >
                Start 30-day free trial
              </Link>
              <Link
                href="/auth/signin"
                className="min-h-[48px] inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
              >
                Login Area
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
