"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingNav } from "@/components/landing/landing-nav"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { calculateDelayMetrics } from "@/lib/delay-cost-calculator/calculations"
import { generateDynamicInsight, generateShareSummary } from "@/lib/delay-cost-calculator/copy"
import type { DelayCalculatorInputs } from "@/lib/delay-cost-calculator/types"
import { formatCurrency, formatPercent, sanitizeNumber } from "@/lib/delay-cost-calculator/format"

const LABEL = "block text-sm font-medium text-gray-900"
const HELPER = "mt-1 text-sm text-gray-500"
const INPUT =
  "mt-2 block min-h-[48px] w-full rounded-xl border border-[#E6E8EF] bg-white px-4 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
const SECTION = "rounded-2xl border border-[#E6E8EF] bg-white p-6 shadow-sm sm:p-8"
const CARD_GRID = "grid gap-4 sm:grid-cols-2"

function parseOptionalInt(s: string): number | null {
  const t = s.trim()
  if (t === "") return null
  const n = Math.floor(Number(t))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, 50_000)
}

type NumField = keyof Pick<
  DelayCalculatorInputs,
  | "loanAmount"
  | "annualInterestRate"
  | "monthlyOverhead"
  | "monthlyHolding"
  | "expectedGrossProfit"
  | "delayDays"
>

export function DelayCostCalculatorPage() {
  const [inputs, setInputs] = useState<DelayCalculatorInputs>(() => ({
    loanAmount: 300_000,
    annualInterestRate: 9,
    monthlyOverhead: 1200,
    monthlyHolding: 350,
    expectedGrossProfit: 40_000,
    delayDays: 21,
    activeHomes: null,
  }))
  const [activeHomesRaw, setActiveHomesRaw] = useState("")

  const metrics = useMemo(() => calculateDelayMetrics(inputs), [inputs])

  const setNum = useCallback((field: NumField, raw: string) => {
    const n = sanitizeNumber(raw, 0)
    setInputs((prev) => ({ ...prev, [field]: n < 0 ? 0 : n }))
  }, [])

  const leadRef = useRef<HTMLDivElement>(null)
  const [primaryEmail, setPrimaryEmail] = useState("")
  const [primaryName, setPrimaryName] = useState("")
  const [primaryLoading, setPrimaryLoading] = useState(false)
  const [primaryError, setPrimaryError] = useState("")
  const [primarySuccess, setPrimarySuccess] = useState(false)
  const [primaryEmailSent, setPrimaryEmailSent] = useState(false)

  const [passiveEmail, setPassiveEmail] = useState("")
  const [passiveLoading, setPassiveLoading] = useState(false)
  const [passiveError, setPassiveError] = useState("")
  const [passiveSuccess, setPassiveSuccess] = useState(false)

  const [copyState, setCopyState] = useState<"idle" | "copied">("idle")

  const scrollToLead = () => {
    leadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    window.setTimeout(() => {
      leadRef.current?.querySelector<HTMLElement>("input[type=email]")?.focus()
    }, 450)
  }

  const submitLead = async (formVariant: "primary" | "passive", email: string, firstName?: string) => {
    const res = await fetch("/api/tools/delay-cost-calculator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        firstName: firstName?.trim() || undefined,
        formVariant,
        inputs: {
          loanAmount: inputs.loanAmount,
          annualInterestRate: inputs.annualInterestRate,
          monthlyOverhead: inputs.monthlyOverhead,
          monthlyHolding: inputs.monthlyHolding,
          expectedGrossProfit: inputs.expectedGrossProfit,
          delayDays: inputs.delayDays,
          activeHomes: inputs.activeHomes,
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Request failed")
    }
    return data as { success?: boolean; emailSent?: boolean; message?: string }
  }

  const onPrimarySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPrimaryError("")
    setPrimaryLoading(true)
    try {
      const data = await submitLead("primary", primaryEmail.trim(), primaryName)
      setPrimarySuccess(true)
      setPrimaryEmailSent(data.emailSent === true)
      setPrimaryEmail("")
      setPrimaryName("")
    } catch (err) {
      setPrimaryError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setPrimaryLoading(false)
    }
  }

  const onPassiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassiveError("")
    setPassiveLoading(true)
    try {
      await submitLead("passive", passiveEmail.trim())
      setPassiveSuccess(true)
      setPassiveEmail("")
    } catch (err) {
      setPassiveError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setPassiveLoading(false)
    }
  }

  const shareText = useMemo(
    () => generateShareSummary(metrics, Math.round(inputs.delayDays), inputs.activeHomes),
    [metrics, inputs.delayDays, inputs.activeHomes]
  )

  const insight = useMemo(() => generateDynamicInsight(metrics.totalDelayCost), [metrics.totalDelayCost])

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopyState("copied")
      window.setTimeout(() => setCopyState("idle"), 2200)
    } catch {
      setCopyState("idle")
    }
  }

  const delayDaysRounded = Math.max(0, Math.round(inputs.delayDays))

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <LandingNav />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:max-w-5xl lg:px-8">
        {/* Hero */}
        <header className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Free tool</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
            What is every day of delay costing you?
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-gray-600 sm:text-xl">
            Delays don&apos;t just push schedules. They quietly eat into your profit through interest,
            overhead, and holding costs. This calculator makes that cost visible.
          </p>
          <p className="mt-3 text-sm text-gray-500">
            Uses a sample scenario by default. Adjust the numbers to match your operation.
          </p>
        </header>

        <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-12 lg:items-start">
          {/* Inputs column */}
          <div className="space-y-8 lg:col-span-5">
            <section className={SECTION} aria-labelledby="calc-inputs-title">
              <h2 id="calc-inputs-title" className="text-lg font-semibold text-gray-900">
                Your assumptions
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                All fields are editable. Numbers update results instantly.
              </p>

              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Financing</h3>
                  <div className="mt-4 space-y-5">
                    <div>
                      <label htmlFor="dcc-loan" className={LABEL}>
                        Construction loan amount
                      </label>
                      <input
                        id="dcc-loan"
                        type="number"
                        min={0}
                        step={1000}
                        inputMode="decimal"
                        className={INPUT}
                        value={inputs.loanAmount || ""}
                        onChange={(e) => setNum("loanAmount", e.target.value)}
                        aria-describedby="dcc-loan-help"
                      />
                      <p id="dcc-loan-help" className={HELPER}>
                        Typical range varies by market
                      </p>
                    </div>
                    <div>
                      <label htmlFor="dcc-rate" className={LABEL}>
                        Annual interest rate (%)
                      </label>
                      <input
                        id="dcc-rate"
                        type="number"
                        min={0}
                        max={40}
                        step={0.125}
                        inputMode="decimal"
                        className={INPUT}
                        value={inputs.annualInterestRate || ""}
                        onChange={(e) => setNum("annualInterestRate", e.target.value)}
                        aria-describedby="dcc-rate-help"
                      />
                      <p id="dcc-rate-help" className={HELPER}>
                        Many builders today fall between 8–10%
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900">Operating / carrying costs</h3>
                  <div className="mt-4 space-y-5">
                    <div>
                      <label htmlFor="dcc-overhead" className={LABEL}>
                        Monthly overhead per home
                      </label>
                      <input
                        id="dcc-overhead"
                        type="number"
                        min={0}
                        step={50}
                        inputMode="decimal"
                        className={INPUT}
                        value={inputs.monthlyOverhead || ""}
                        onChange={(e) => setNum("monthlyOverhead", e.target.value)}
                        aria-describedby="dcc-overhead-help"
                      />
                      <p id="dcc-overhead-help" className={HELPER}>
                        Staff, admin, supervision, etc.
                      </p>
                    </div>
                    <div>
                      <label htmlFor="dcc-holding" className={LABEL}>
                        Monthly utilities / maintenance / holding cost
                      </label>
                      <input
                        id="dcc-holding"
                        type="number"
                        min={0}
                        step={25}
                        inputMode="decimal"
                        className={INPUT}
                        value={inputs.monthlyHolding || ""}
                        onChange={(e) => setNum("monthlyHolding", e.target.value)}
                        aria-describedby="dcc-holding-help"
                      />
                      <p id="dcc-holding-help" className={HELPER}>
                        Utilities, insurance, upkeep, etc.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900">Project assumptions</h3>
                  <div className="mt-4 space-y-5">
                    <div>
                      <label htmlFor="dcc-profit" className={LABEL}>
                        Expected gross profit
                      </label>
                      <input
                        id="dcc-profit"
                        type="number"
                        min={0}
                        step={1000}
                        inputMode="decimal"
                        className={INPUT}
                        value={inputs.expectedGrossProfit || ""}
                        onChange={(e) => setNum("expectedGrossProfit", e.target.value)}
                        aria-describedby="dcc-profit-help"
                      />
                      <p id="dcc-profit-help" className={HELPER}>
                        Used to estimate profit erosion
                      </p>
                    </div>
                    <div>
                      <label htmlFor="dcc-days" className={LABEL}>
                        Delay days
                      </label>
                      <input
                        id="dcc-days"
                        type="number"
                        min={0}
                        max={3650}
                        step={1}
                        inputMode="numeric"
                        className={INPUT}
                        value={inputs.delayDays || ""}
                        onChange={(e) => setNum("delayDays", e.target.value)}
                        aria-describedby="dcc-days-help"
                      />
                      <p id="dcc-days-help" className={HELPER}>
                        Try 14, 21, or 30 days
                      </p>
                    </div>
                    <div>
                      <label htmlFor="dcc-homes" className={LABEL}>
                        Number of active homes <span className="font-normal text-gray-500">(optional)</span>
                      </label>
                      <input
                        id="dcc-homes"
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 12"
                        className={INPUT}
                        value={activeHomesRaw}
                        onChange={(e) => {
                          setActiveHomesRaw(e.target.value)
                          const parsed = parseOptionalInt(e.target.value)
                          setInputs((prev) => ({ ...prev, activeHomes: parsed }))
                        }}
                        aria-describedby="dcc-homes-help"
                      />
                      <p id="dcc-homes-help" className={HELPER}>
                        Optional. See how this delay pattern scales across your pipeline
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Results column */}
          <div className="space-y-8 lg:col-span-7">
            <section className={SECTION} aria-labelledby="snapshot-title">
              <h2 id="snapshot-title" className="text-lg font-semibold text-gray-900">
                Your Delay Snapshot
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                Every day this home sits longer on the schedule, it continues to absorb financing and
                carrying costs.
              </p>

              <div className="mt-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-white p-6 sm:p-8">
                <p className="text-sm font-medium text-gray-600">Estimated cost per day</p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                  {formatCurrency(metrics.dailyDelayCost)}
                </p>
                <p className="mt-3 text-sm text-gray-500">Financing + overhead + holding, combined</p>
              </div>

              <div className={`${CARD_GRID} mt-8`}>
                <div className="rounded-xl border border-[#E6E8EF] bg-gray-50/80 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Your delay period
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">
                    {formatCurrency(metrics.totalDelayCost)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{delayDaysRounded} days</p>
                </div>
                <div className="rounded-xl border border-[#E6E8EF] bg-gray-50/80 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Weekly impact</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">
                    {formatCurrency(metrics.weeklyDelayCost)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">7 days</p>
                </div>
                <div className="rounded-xl border border-[#E6E8EF] bg-gray-50/80 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">30-day impact</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">
                    {formatCurrency(metrics.monthlyDelayCost)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">Approx. one month</p>
                </div>
                {metrics.profitErosionPercent != null ? (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-900/80">
                      Profit erosion
                    </p>
                    <p className="mt-1 text-xl font-semibold text-amber-950">
                      {formatPercent(metrics.profitErosionPercent, 1)}
                    </p>
                    <p className="mt-1 text-sm text-amber-900/70">Share of expected gross profit</p>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Delay Reality Check */}
            <section
              className="rounded-2xl border-2 border-primary/25 bg-white p-6 shadow-md sm:p-8"
              aria-labelledby="reality-title"
            >
              <h2 id="reality-title" className="text-xl font-semibold text-gray-900">
                Delay Reality Check
              </h2>
              <p className="mt-3 text-base font-medium text-gray-800">This delay is costing more than it feels.</p>
              <p className="mt-4 text-base leading-relaxed text-gray-600">
                In just {delayDaysRounded} days, this home absorbs{" "}
                <strong className="text-gray-900">{formatCurrency(metrics.totalDelayCost)}</strong> in
                additional cost. That&apos;s not from one big mistake. It&apos;s the accumulation of small gaps.
              </p>
              <p className="mt-2 text-sm italic text-gray-600">{insight}</p>
              <div className="mt-6">
                <p className="text-sm font-semibold text-gray-900">What this really means:</p>
                <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-gray-600">
                  <li>Every day the schedule slips, costs keep running in the background</li>
                  <li>Delays are usually not dramatic, just untracked</li>
                  <li>Most of these gaps are preventable with better coordination</li>
                </ul>
              </div>
            </section>

            {/* Breakdown */}
            <section className={SECTION} aria-labelledby="breakdown-title">
              <h2 id="breakdown-title" className="text-lg font-semibold text-gray-900">
                Where the cost is coming from
              </h2>
              <ul className="mt-6 divide-y divide-[#E6E8EF]">
                <li className="flex items-center justify-between py-3 text-sm sm:text-base">
                  <span className="text-gray-600">Interest carrying cost per day</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(metrics.dailyInterest)}
                  </span>
                </li>
                <li className="flex items-center justify-between py-3 text-sm sm:text-base">
                  <span className="text-gray-600">Overhead allocation per day</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(metrics.dailyOverhead)}
                  </span>
                </li>
                <li className="flex items-center justify-between py-3 text-sm sm:text-base">
                  <span className="text-gray-600">Holding cost per day</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(metrics.dailyHolding)}
                  </span>
                </li>
              </ul>
            </section>

            {/* Multi-home */}
            {inputs.activeHomes != null && inputs.activeHomes > 0 && metrics.portfolioDelayCost != null ? (
              <section
                className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 sm:p-8"
                aria-labelledby="portfolio-title"
              >
                <h2 id="portfolio-title" className="text-lg font-semibold text-emerald-950">
                  Pipeline impact
                </h2>
                <p className="mt-3 text-base leading-relaxed text-emerald-900/90">
                  Across <strong>{inputs.activeHomes}</strong> homes, this delay pattern costs approximately{" "}
                  <strong>{formatCurrency(metrics.portfolioDelayCost)}</strong>.
                </p>
                <p className="mt-3 text-sm text-emerald-900/80">
                  Small delays compound quickly when they repeat across an active pipeline.
                </p>
                <div className="mt-6 rounded-xl border border-emerald-200/80 bg-white/80 p-4">
                  <p className="text-sm font-semibold text-gray-900">Want to track this across all your projects?</p>
                  <p className="mt-2 text-sm text-gray-600">
                    We&apos;ll send you practical tools to monitor delays and reduce them.
                  </p>
                  <Button type="button" variant="outline" className="mt-4" onClick={scrollToLead}>
                    Get the tools
                  </Button>
                </div>
              </section>
            ) : null}

            {/* Primary lead */}
            <section
              ref={leadRef}
              id="lead-capture-primary"
              tabIndex={-1}
              className={`${SECTION} scroll-mt-28 outline-none`}
              aria-labelledby="lead-primary-title"
            >
              <h2 id="lead-primary-title" className="text-lg font-semibold text-gray-900">
                Want a copy of this analysis?
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Get a clean summary of your results and more practical tools like this from Phase.
              </p>

              {primarySuccess ? (
                <div className="mt-8 rounded-xl border border-[#E6E8EF] bg-gray-50/80 p-6">
                  <p className="text-lg font-medium text-gray-900">
                    {primaryEmailSent
                      ? "Check your inbox. We sent your delay breakdown and a few practical insights."
                      : "Thanks — we saved your request."}
                  </p>
                  {!primaryEmailSent ? (
                    <p className="mt-2 text-sm text-gray-600">
                      Email delivery is temporarily unavailable; our team still received your details.
                    </p>
                  ) : null}
                </div>
              ) : (
                <form onSubmit={onPrimarySubmit} className="mt-8 space-y-5">
                  <div>
                    <label htmlFor="lead-email" className={LABEL}>
                      Email <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="lead-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className={INPUT}
                      value={primaryEmail}
                      onChange={(e) => setPrimaryEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="lead-name" className={LABEL}>
                      First name <span className="font-normal text-gray-500">(optional)</span>
                    </label>
                    <input
                      id="lead-name"
                      name="firstName"
                      type="text"
                      autoComplete="given-name"
                      className={INPUT}
                      value={primaryName}
                      onChange={(e) => setPrimaryName(e.target.value)}
                      placeholder="Alex"
                    />
                  </div>
                  {primaryError ? (
                    <p className="text-sm text-red-600" role="alert">
                      {primaryError}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    size="lg"
                    className="min-h-[48px] w-full rounded-xl text-base font-semibold sm:w-auto"
                    disabled={primaryLoading}
                  >
                    {primaryLoading ? "Sending…" : "Send me my results"}
                  </Button>
                </form>
              )}
            </section>

            {/* Share */}
            <section className={SECTION} aria-labelledby="share-title">
              <h2 id="share-title" className="text-lg font-semibold text-gray-900">
                Share this insight
              </h2>
              <p className="mt-3 rounded-lg bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                {shareText}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-4 min-h-[44px]"
                onClick={copySummary}
              >
                {copyState === "copied" ? "Copied" : "Copy summary"}
              </Button>
            </section>

            {/* How it works */}
            <section className={SECTION}>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="how" className="border-none">
                  <AccordionTrigger className="py-2 text-left text-lg font-semibold text-gray-900 hover:no-underline">
                    How this estimate works
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-gray-600">
                    <p>
                      This calculator estimates the daily cost of a delayed home by combining three factors:
                    </p>
                    <ul className="mt-3 list-inside list-disc space-y-2">
                      <li>Financing cost based on your construction loan and interest rate</li>
                      <li>Overhead allocated per home</li>
                      <li>Ongoing holding costs such as utilities and maintenance</li>
                    </ul>
                    <p className="mt-4">
                      The result is a simple estimate of how much each day of delay impacts your bottom line.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            {/* Bottom CTA */}
            <section
              className="rounded-2xl border border-[#E6E8EF] bg-gray-900 p-8 text-white sm:p-10"
              aria-labelledby="phase-cta-title"
            >
              <h2 id="phase-cta-title" className="text-xl font-semibold sm:text-2xl">
                Want fewer delays, not just better math?
              </h2>
              <p className="mt-4 text-base leading-relaxed text-gray-300">
                Most delays aren&apos;t caused by one big issue. They come from missed confirmations, unclear
                schedules, material timing gaps, and lack of visibility in the field. Phase helps builders reduce
                cycle time by improving coordination, communication, and accountability.
              </p>
              <Link
                href="/#hero"
                className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-white px-6 text-base font-semibold text-gray-900 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                See how Phase works
              </Link>
            </section>

            <p className="text-center text-xs text-gray-500">
              This is a simplified estimate. Actual costs vary based on financing structure, operating model,
              and market conditions.
            </p>

            {/* Passive lead */}
            <section className={SECTION} aria-labelledby="passive-lead-title">
              <h2 id="passive-lead-title" className="text-lg font-semibold text-gray-900">
                Get practical tools for builders
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                No fluff. Just systems to reduce delays and improve operations.
              </p>
              {passiveSuccess ? (
                <p className="mt-6 text-base font-medium text-gray-900">
                  You&apos;re on the list. Watch your inbox for practical tools from Phase.
                </p>
              ) : (
                <form onSubmit={onPassiveSubmit} className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="passive-email" className={LABEL}>
                      Email
                    </label>
                    <input
                      id="passive-email"
                      type="email"
                      required
                      autoComplete="email"
                      className={INPUT}
                      value={passiveEmail}
                      onChange={(e) => setPassiveEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="default"
                    className="min-h-[48px] shrink-0 rounded-xl px-6"
                    disabled={passiveLoading}
                  >
                    {passiveLoading ? "Sending…" : "Send me tools"}
                  </Button>
                </form>
              )}
              {passiveError ? (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {passiveError}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </div>
      <LandingFooter />
    </div>
  )
}
