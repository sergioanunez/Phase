"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { LandingNav } from "@/components/landing/landing-nav"
import { LandingFooter } from "@/components/landing/landing-footer"

type HomesVolume = "1-20" | "20-50" | "50-100" | "100+"

const VOLUME_OPTIONS: { value: HomesVolume; label: string }[] = [
  { value: "1-20", label: "1–20" },
  { value: "20-50", label: "20–50" },
  { value: "50-100", label: "50–100" },
  { value: "100+", label: "100+" },
]

function isFoundersVolume(v: HomesVolume): boolean {
  return v === "20-50" || v === "50-100" || v === "100+"
}

const CHALLENGE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Select one" },
  { value: "scheduling-subs", label: "Scheduling subs" },
  { value: "material-delays", label: "Material delays" },
  { value: "visibility-across-homes", label: "Visibility across homes" },
  { value: "communication", label: "Communication" },
  { value: "other", label: "Other" },
]

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  "white-label": "White Label",
}

const inputClass =
  "mt-2 block min-h-[48px] w-full rounded-xl border border-[#E6E8EF] bg-white px-4 text-gray-900 shadow-sm focus:border-[primary] focus:outline-none focus:ring-2 focus:ring-[primary]/20"
const labelClass = "block text-sm font-medium text-gray-900"

export function ContactIntake() {
  const searchParams = useSearchParams()
  const planParam = useMemo(
    () => (searchParams?.get("plan") || "").toLowerCase().replace(/\s+/g, "-"),
    [searchParams]
  )
  const planLabel = planParam && PLAN_LABELS[planParam] ? PLAN_LABELS[planParam] : null

  const demoFormRef = useRef<HTMLDivElement>(null)

  const [volume, setVolume] = useState<HomesVolume | "">("")
  const [routed, setRouted] = useState(false)
  const [branch, setBranch] = useState<"founders" | "demo" | null>(null)

  const [companyName, setCompanyName] = useState("")
  const [demoVolume, setDemoVolume] = useState<HomesVolume | "">("")
  const [biggestChallenge, setBiggestChallenge] = useState("")
  const [challengeOther, setChallengeOther] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [slowdownToday, setSlowdownToday] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const scrollToDemoForm = () => {
    demoFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    const first = demoFormRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button"
    )
    window.setTimeout(() => first?.focus(), 400)
  }

  const handleContinue = () => {
    if (!volume) return
    setRouted(true)
    setBranch(isFoundersVolume(volume) ? "founders" : "demo")
    if (!isFoundersVolume(volume)) {
      setDemoVolume(volume)
    }
  }

  const handleStartOver = () => {
    setRouted(false)
    setBranch(null)
    setVolume("")
    setDemoVolume("")
    setCompanyName("")
    setBiggestChallenge("")
    setChallengeOther("")
    setPhone("")
    setEmail("")
    setSlowdownToday("")
    setSuccess(false)
    setError("")
  }

  const handleSubmitDemo = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/contact/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          volumePerYear: demoVolume,
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          biggestChallenge,
          challengeOther:
            biggestChallenge === "other" ? challengeOther.trim() || undefined : undefined,
          slowdownToday: slowdownToday.trim() || undefined,
          plan: planParam || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.")
        setLoading(false)
        return
      }
      setSuccess(true)
      setCompanyName("")
      setPhone("")
      setEmail("")
      setBiggestChallenge("")
      setChallengeOther("")
      setSlowdownToday("")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <LandingNav />
      <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
          Let&apos;s see if Phase fits your operation
        </h1>
        <p className="mt-4 text-base leading-relaxed text-gray-600">
          We work with builders to reduce cycle time and bring control to scheduling. Answer a few quick
          questions and we&apos;ll route you to the right next step.
        </p>
        {planLabel ? (
          <p className="mt-3 text-sm font-medium text-primary">
            You came from the <strong>{planLabel}</strong> plan.
          </p>
        ) : null}

        {!routed ? (
          <div className="mt-10 transition-opacity duration-200">
            <fieldset>
              <legend className={`${labelClass}`}>
                How many homes do you build per year? <span className="text-red-600">*</span>
              </legend>
              <div className="mt-4 space-y-2">
                {VOLUME_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-[#E6E8EF] bg-white px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30"
                  >
                    <input
                      type="radio"
                      name="homesPerYear"
                      value={value}
                      checked={volume === value}
                      onChange={() => setVolume(value)}
                      className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-base text-gray-900">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-8">
              <button
                type="button"
                onClick={handleContinue}
                disabled={!volume}
                className="min-h-[48px] w-full rounded-xl bg-primary px-6 text-base font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[200px]"
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {routed && branch === "founders" ? (
          <div
            className="mt-10 rounded-2xl border border-[#E6E8EF] bg-white p-6 shadow-sm transition-opacity duration-200 sm:p-8"
            role="region"
            aria-labelledby="founders-fit-title"
          >
            <h2 id="founders-fit-title" className="text-xl font-semibold text-gray-900 sm:text-2xl">
              You may be a fit for Founders10
            </h2>
            <p className="mt-3 text-base leading-relaxed text-gray-600">
              We&apos;re working with a small group of builders running real volume to refine Phase in live
              operations.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/founders10"
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-gray-900 px-6 text-base font-semibold text-white transition hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
              >
                Apply for Founders10
              </Link>
              <button
                type="button"
                onClick={handleStartOver}
                className="text-sm font-medium text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                Change answer
              </button>
            </div>
          </div>
        ) : null}

        {routed && branch === "demo" ? (
          <div className="mt-10 space-y-10 transition-opacity duration-200">
            <div
              className="rounded-2xl border border-[#E6E8EF] bg-white p-6 shadow-sm sm:p-8"
              role="region"
              aria-labelledby="demo-walk-title"
            >
              <h2 id="demo-walk-title" className="text-xl font-semibold text-gray-900 sm:text-2xl">
                Let&apos;s walk you through Phase
              </h2>
              <p className="mt-3 text-base leading-relaxed text-gray-600">
                We&apos;ll show you how builders are using Phase to improve scheduling and execution.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={scrollToDemoForm}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-6 text-base font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  Request demo
                </button>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="text-sm font-medium text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  Change answer
                </button>
              </div>
            </div>

            <div
              id="demo-form"
              ref={demoFormRef}
              tabIndex={-1}
              className="scroll-mt-24 rounded-2xl border border-[#E6E8EF] bg-white p-6 shadow-sm outline-none sm:p-8"
            >
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Tell us about your operation</h2>
              <p className="mt-3 text-base leading-relaxed text-gray-600">
                We work with builders to improve scheduling and reduce cycle time. If it looks like a fit,
                we&apos;ll reach out.
              </p>

              {success ? (
                <div className="mt-8 space-y-4">
                  <div className="rounded-xl border border-[#E6E8EF] bg-gray-50/80 p-6">
                    <p className="text-lg font-medium text-gray-900">Thanks — we&apos;ll be in touch.</p>
                    <p className="mt-2 text-sm text-gray-600">
                      We&apos;ve received your request and will contact you at the email you provided.
                    </p>
                  </div>
                  <p className="text-center text-sm text-gray-500">
                    <Link
                      href="/founders10"
                      className="font-medium text-gray-700 underline-offset-4 hover:text-gray-900 hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    >
                      Looking for early access? → Founders10
                    </Link>
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitDemo} className="mt-8 space-y-5">
                  <div>
                    <label htmlFor="demo-company" className={labelClass}>
                      Company name <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="demo-company"
                      name="companyName"
                      type="text"
                      autoComplete="organization"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className={inputClass}
                      placeholder="Your company"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-volume" className={labelClass}>
                      Homes built per year <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="demo-volume"
                      name="volumePerYear"
                      required
                      value={demoVolume}
                      onChange={(e) => setDemoVolume(e.target.value as HomesVolume)}
                      className={inputClass}
                    >
                      {VOLUME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="demo-challenge" className={labelClass}>
                      Biggest challenge right now <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="demo-challenge"
                      name="biggestChallenge"
                      required
                      value={biggestChallenge}
                      onChange={(e) => setBiggestChallenge(e.target.value)}
                      className={inputClass}
                    >
                      {CHALLENGE_OPTIONS.map((o) => (
                        <option key={o.value || "empty"} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {biggestChallenge === "other" ? (
                      <div className="mt-3">
                        <label htmlFor="demo-challenge-other" className={labelClass}>
                          Describe <span className="text-red-600">*</span>
                        </label>
                        <input
                          id="demo-challenge-other"
                          name="challengeOther"
                          type="text"
                          value={challengeOther}
                          onChange={(e) => setChallengeOther(e.target.value)}
                          className={inputClass}
                          required
                        />
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="demo-phone" className={labelClass}>
                      Phone <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="demo-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={inputClass}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-email" className={labelClass}>
                      Email <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="demo-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      placeholder="you@company.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-slowdown" className={labelClass}>
                      What&apos;s slowing your builds down today?
                    </label>
                    <textarea
                      id="demo-slowdown"
                      name="slowdownToday"
                      rows={4}
                      value={slowdownToday}
                      onChange={(e) => setSlowdownToday(e.target.value)}
                      className="mt-2 block w-full rounded-xl border border-[#E6E8EF] bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-[primary] focus:outline-none focus:ring-2 focus:ring-[primary]/20"
                      placeholder="A few sentences is enough."
                    />
                  </div>
                  {error ? (
                    <p className="text-sm text-red-600" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="min-h-[48px] w-full rounded-xl bg-primary px-6 text-base font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
                    >
                      {loading ? "Sending…" : "See if Phase fits"}
                    </button>
                  </div>
                  <p className="text-center text-sm text-gray-500">
                    <Link
                      href="/founders10"
                      className="font-medium text-gray-700 underline-offset-4 hover:text-gray-900 hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    >
                      Looking for early access? → Founders10
                    </Link>
                  </p>
                </form>
              )}
            </div>
          </div>
        ) : null}
      </main>
      <LandingFooter />
    </div>
  )
}
