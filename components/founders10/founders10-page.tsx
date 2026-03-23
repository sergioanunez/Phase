"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"

import logoImage from "../../public/logo.png"
import {
  FOUNDERS10_SPOTS_REMAINING,
  FOUNDERS10_TOTAL_SPOTS,
} from "@/lib/founders10-config"

const SECTION = "mx-auto max-w-2xl px-4 sm:px-6 lg:max-w-3xl lg:px-8"
const INPUT =
  "mt-2 block min-h-[48px] w-full rounded-lg border border-stone-300/90 bg-white px-4 text-base text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-400/40"
const LABEL = "block text-sm font-medium text-stone-800"
const FIELDSET = "space-y-2"
const RADIO_ROW =
  "flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border border-stone-300/90 bg-white px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-stone-400/50"

function scrollToApply() {
  document.getElementById("application")?.scrollIntoView({ behavior: "smooth", block: "start" })
}

export function Founders10Page() {
  const [name, setName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [homesPerYear, setHomesPerYear] = useState<"1-20" | "20-50" | "50-100" | "100+" | "">("")
  const [biggestChallenge, setBiggestChallenge] = useState("")
  const [challengeOther, setChallengeOther] = useState("")
  const [currentSystem, setCurrentSystem] = useState("")
  const [systemOther, setSystemOther] = useState("")
  const [readiness, setReadiness] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [improvementQuestion, setImprovementQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const spots = Math.max(
    0,
    Math.min(FOUNDERS10_TOTAL_SPOTS, FOUNDERS10_SPOTS_REMAINING)
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/founders10/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          companyName: companyName.trim(),
          homesPerYear,
          biggestChallenge,
          challengeOther: challengeOther.trim() || undefined,
          currentSystem,
          systemOther: systemOther.trim() || undefined,
          readiness,
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          improvementQuestion: improvementQuestion.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.")
        setLoading(false)
        return
      }
      setSuccess(true)
      setName("")
      setCompanyName("")
      setHomesPerYear("")
      setBiggestChallenge("")
      setChallengeOther("")
      setCurrentSystem("")
      setSystemOther("")
      setReadiness("")
      setPhone("")
      setEmail("")
      setImprovementQuestion("")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f0eeeb] text-stone-900">
      <header className="sticky top-0 z-40 border-b border-stone-300/60 bg-[#f0eeeb]/95 backdrop-blur supports-[backdrop-filter]:bg-[#f0eeeb]/90">
        <div className={`${SECTION} flex h-14 items-center justify-between sm:h-16`}>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f0eeeb]"
            aria-label="Phase home"
          >
            <div className="relative flex h-9 w-28 items-center sm:h-10 sm:w-32 md:h-[3.2rem] md:w-48 lg:h-[3.2rem] lg:w-52">
              <Image
                src={logoImage}
                alt=""
                fill
                className="object-contain object-left"
                priority
                quality={90}
                sizes="(min-width: 1024px) 416px, (min-width: 768px) 384px, 256px"
              />
            </div>
          </Link>
          <a
            href="#application"
            className="text-sm font-medium text-stone-700 underline-offset-4 hover:text-stone-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2"
          >
            Apply
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section
          className="relative overflow-hidden border-b border-stone-300/60 bg-[#141618] px-4 pb-14 pt-10 text-[#f4f3f0] sm:px-6 sm:pb-16 sm:pt-14 lg:px-8"
          aria-labelledby="founders10-hero-title"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/15 to-black/35"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_top,black,transparent_55%)]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(184,168,130,0.30) 0, rgba(184,168,130,0.30) 1px, transparent 1px, transparent 24px), repeating-linear-gradient(90deg, rgba(184,168,130,0.22) 0, rgba(184,168,130,0.22) 1px, transparent 1px, transparent 24px)",
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />

          <div className={`${SECTION} relative z-10 max-w-2xl`}>
            <p className="font-[family-name:var(--font-cormorant-garamond)] text-sm font-semibold tracking-[0.2em] text-[#f5f0e8] uppercase">
              You&apos;ve been invited
            </p>
            <h1
              id="founders10-hero-title"
              className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold tracking-tight text-[#f4f3f0] sm:text-5xl"
            >
              Founders<span className="text-primary">10</span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-stone-300 sm:text-xl">
              10 builders.
              <br />
              One system.
              <br />
              Built together.
            </p>
            <div className="mt-10 flex w-full flex-col items-stretch sm:inline-flex sm:w-auto sm:items-start">
              <button
                type="button"
                onClick={scrollToApply}
                className="inline-flex min-h-[56px] w-full items-center justify-center rounded-xl bg-[#f4f3f0] px-8 text-base font-semibold text-[#141618] shadow-md transition hover:bg-white active:translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8a882] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141618] sm:w-auto"
              >
                Apply for Founders10
              </button>
              <p className="mt-2.5 text-left text-xs text-stone-200/95">
                Takes about 2 minutes.
              </p>
            </div>
          </div>
        </section>

        {/* What this is */}
        <section className={`${SECTION} py-14 sm:py-16`} aria-labelledby="what-this-is">
          <h2 id="what-this-is" className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold tracking-tight leading-tight text-stone-900 sm:text-3xl">
            What this is
          </h2>
          <p className="mt-5 text-base leading-relaxed text-stone-700 sm:text-lg">
            Founders10 is a small group of builders we&apos;ll work closely with to:
          </p>
          <ul className="mt-6 space-y-3 border-l-2 border-stone-400/80 pl-5 text-base text-stone-800 sm:text-[17px]" role="list">
            <li>Reduce build cycle time</li>
            <li>Eliminate scheduling chaos</li>
            <li>Run jobs with real-time execution visibility</li>
          </ul>
          <p className="mt-8 text-base font-medium text-stone-800 sm:text-lg">
            This is not a trial.
            <br />
            This is early adoption.
          </p>
        </section>

        <div className="border-t border-stone-300/70" aria-hidden />

        {/* Why only 10 */}
        <section className={`${SECTION} py-14 sm:py-16`} aria-labelledby="why-ten">
          <h2 id="why-ten" className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold tracking-tight leading-tight text-stone-900 sm:text-3xl">
            Why only 10
          </h2>
          <p className="mt-5 text-base leading-relaxed text-stone-700 sm:text-lg">
            We&apos;re limiting this to 10 builders because we work directly with each team to:
          </p>
          <ul className="mt-6 space-y-3 border-l-2 border-stone-400/80 pl-5 text-base text-stone-800 sm:text-[17px]" role="list">
            <li>implement Phase into real operations</li>
            <li>refine workflows around real jobsites</li>
            <li>build the system with real field feedback</li>
          </ul>
          <p className="mt-8 text-base text-stone-700 sm:text-lg">
            This only works at a small scale.
          </p>
        </section>

        <div className="border-t border-stone-300/70" aria-hidden />

        {/* What you get */}
        <section className={`${SECTION} py-14 sm:py-16`} aria-labelledby="what-you-get">
          <h2 id="what-you-get" className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold tracking-tight leading-tight text-stone-900 sm:text-3xl">
            What you get
          </h2>
          <ul className="mt-8 space-y-4 text-base text-stone-800 sm:text-[17px]" role="list">
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-600" aria-hidden />
              <span>Unlimited homes</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-600" aria-hidden />
              <span>Direct access to product development</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-600" aria-hidden />
              <span>Priority support</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-600" aria-hidden />
              <span>Locked founder pricing</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-600" aria-hidden />
              <span>60-day implementation period before billing starts</span>
            </li>
          </ul>
          <p className="mt-10 text-base italic text-stone-600 sm:text-lg">
            You&apos;re not just using Phase.
            <br />
            You&apos;re helping shape it.
          </p>
        </section>

        <div className="border-t border-stone-300/70" aria-hidden />

        {/* Who this is for */}
        <section className={`${SECTION} py-14 sm:py-16`} aria-labelledby="who-for">
          <h2 id="who-for" className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold tracking-tight leading-tight text-stone-900 sm:text-3xl">
            Who this is for
          </h2>
          <p className="mt-5 text-base leading-relaxed text-stone-700 sm:text-lg">
            Founders10 is for builders who:
          </p>
          <ul className="mt-6 space-y-3 border-l-2 border-stone-400/80 pl-5 text-base text-stone-800 sm:text-[17px]" role="list">
            <li>are building at real operational volume</li>
            <li>care about cycle time and field control</li>
            <li>want better systems, not more software</li>
            <li>are willing to help refine the way Phase works in the field</li>
          </ul>
          <p className="mt-8 text-base text-stone-600 sm:text-[17px]">
            This is not for passive users or builders looking for another reporting tool.
          </p>
        </section>

        <div className="border-t border-stone-300/70" aria-hidden />

        {/* Repeat CTA */}
        <section className={`${SECTION} py-12 sm:py-14`}>
          <div className="text-center">
            <button
              type="button"
              onClick={scrollToApply}
              className="inline-flex min-h-[48px] w-full max-w-md items-center justify-center rounded-lg border border-stone-800 bg-stone-900 px-8 text-base font-semibold text-[#f4f3f0] shadow-sm transition hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f0eeeb] sm:w-auto"
            >
              Apply for Founders10
            </button>
          </div>
        </section>

        {/* Spots remaining */}
        <section className={`${SECTION} pt-2 pb-12 sm:pt-4 sm:pb-14`} aria-labelledby="spots-heading">
          <div className="rounded-2xl border border-stone-300 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-7">
            <h2 id="spots-heading" className="sr-only">
              Availability
            </h2>
            <p className="text-center font-[family-name:var(--font-cormorant-garamond)] text-xl font-medium tracking-wide text-stone-900 sm:text-2xl">
              {spots} of {FOUNDERS10_TOTAL_SPOTS} spots remaining
            </p>
            <p className="mt-2 text-center text-sm leading-relaxed text-stone-600">
              We&apos;re onboarding builders one at a time.
            </p>
          </div>
        </section>

        <div className="border-t border-stone-300/70" aria-hidden />

        {/* Application form */}
        <section
          id="application"
          className={`${SECTION} scroll-mt-20 pb-20 pt-14 sm:pb-24 sm:pt-16`}
          aria-labelledby="application-heading"
        >
          <h2
            id="application-heading"
            className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold tracking-tight leading-tight text-stone-900 sm:text-3xl"
          >
            Application
          </h2>
          <p className="mt-3 text-base text-stone-600">
            Short form — most builders finish in under 2 minutes.
          </p>
          <p className="mt-5 border-l-2 border-stone-300 pl-4 text-base font-medium text-stone-800">
            Most builders don&apos;t need more software. They need control.
          </p>

          {success ? (
            <div
              className="mt-10 rounded-xl border border-stone-300/80 bg-white p-8 shadow-sm sm:p-10"
              role="status"
              aria-live="polite"
            >
              <h3 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold leading-snug text-stone-900">
                You&apos;re one step closer to Founders10.
              </h3>
              <p className="mt-5 text-base leading-relaxed text-stone-700">
                We review every builder to make sure it&apos;s the right fit.
              </p>
              <p className="mt-4 text-base leading-relaxed text-stone-700">
                We&apos;re selecting 10 builders to work closely with.
                <br />
                Not everyone gets in.
              </p>
              <p className="mt-4 text-base leading-relaxed text-stone-700">
                If selected, we&apos;ll reach out within 24–48 hours to walk through your operation and see how
                Phase fits your workflow.
              </p>
              <p className="mt-6 text-base leading-relaxed text-stone-800">
                In the meantime, keep an eye on your phone.
                <br />
                We move fast with builders who are ready.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div className="space-y-0">
                <label htmlFor="founders-name" className={LABEL}>
                  Name <span className="text-red-700">*</span>
                </label>
                <input
                  id="founders-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT}
                />
              </div>

              <div className="space-y-0">
                <label htmlFor="founders-company" className={LABEL}>
                  Company name <span className="text-red-700">*</span>
                </label>
                <input
                  id="founders-company"
                  name="companyName"
                  type="text"
                  autoComplete="organization"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={INPUT}
                />
              </div>

              <fieldset className={FIELDSET}>
                <legend className={LABEL}>
                  Homes built per year <span className="text-red-700">*</span>
                </legend>
                {(
                  [
                    { v: "1-20", l: "1–20" },
                    { v: "20-50", l: "20–50" },
                    { v: "50-100", l: "50–100" },
                    { v: "100+", l: "100+" },
                  ] as const
                ).map(({ v, l }, i) => (
                  <label key={v} className={RADIO_ROW}>
                    <input
                      type="radio"
                      name="homesPerYear"
                      value={v}
                      checked={homesPerYear === v}
                      onChange={() => setHomesPerYear(v)}
                      required={i === 0}
                      className="h-5 w-5 shrink-0 border-stone-400 text-stone-800 focus:ring-2 focus:ring-stone-500"
                    />
                    <span className="text-base text-stone-900">{l}</span>
                  </label>
                ))}
              </fieldset>

              <div>
                <label htmlFor="founders-challenge" className={LABEL}>
                  Biggest challenge today <span className="text-red-700">*</span>
                </label>
                <select
                  id="founders-challenge"
                  name="biggestChallenge"
                  required
                  value={biggestChallenge}
                  onChange={(e) => setBiggestChallenge(e.target.value)}
                  className={INPUT}
                >
                  <option value="">Select one</option>
                  <option value="keeping-schedules-on-track">Keeping schedules on track</option>
                  <option value="subcontractor-coordination">Subcontractor coordination</option>
                  <option value="delays-between-phases">Delays between phases</option>
                  <option value="lack-of-visibility">Lack of visibility</option>
                  <option value="communication-across-teams">Communication across teams</option>
                  <option value="other">Other</option>
                </select>
                {biggestChallenge === "other" ? (
                  <div className="mt-3">
                    <label htmlFor="founders-challenge-other" className={LABEL}>
                      Describe <span className="text-red-700">*</span>
                    </label>
                    <input
                      id="founders-challenge-other"
                      name="challengeOther"
                      type="text"
                      value={challengeOther}
                      onChange={(e) => setChallengeOther(e.target.value)}
                      className={INPUT}
                      required={biggestChallenge === "other"}
                      aria-required="true"
                    />
                  </div>
                ) : null}
              </div>

              <div>
                <label htmlFor="founders-system" className={LABEL}>
                  Current system <span className="text-red-700">*</span>
                </label>
                <select
                  id="founders-system"
                  name="currentSystem"
                  required
                  value={currentSystem}
                  onChange={(e) => setCurrentSystem(e.target.value)}
                  className={INPUT}
                >
                  <option value="">Select one</option>
                  <option value="paper">Paper schedules</option>
                  <option value="excel">Excel / Google Sheets</option>
                  <option value="buildertrend">Buildertrend</option>
                  <option value="procore">Procore</option>
                  <option value="jobtread">JobTread</option>
                  <option value="other">Other</option>
                </select>
                {currentSystem === "other" ? (
                  <div className="mt-3">
                    <label htmlFor="founders-system-other" className={LABEL}>
                      Describe <span className="text-red-700">*</span>
                    </label>
                    <input
                      id="founders-system-other"
                      name="systemOther"
                      type="text"
                      value={systemOther}
                      onChange={(e) => setSystemOther(e.target.value)}
                      className={INPUT}
                      required={currentSystem === "other"}
                      aria-required="true"
                    />
                  </div>
                ) : null}
              </div>

              <div>
                <label htmlFor="founders-readiness" className={LABEL}>
                  Readiness <span className="text-red-700">*</span>
                </label>
                <select
                  id="founders-readiness"
                  name="readiness"
                  required
                  value={readiness}
                  onChange={(e) => setReadiness(e.target.value)}
                  className={INPUT}
                >
                  <option value="">Select one</option>
                  <option value="actively-looking">Yes, actively looking</option>
                  <option value="exploring">Exploring options</option>
                  <option value="curious">Just curious</option>
                </select>
              </div>

              <div>
                <label htmlFor="founders-phone" className={LABEL}>
                  Phone number <span className="text-red-700">*</span>
                </label>
                <input
                  id="founders-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={INPUT}
                />
              </div>

              <div>
                <label htmlFor="founders-email" className={LABEL}>
                  Email <span className="text-red-700">*</span>
                </label>
                <input
                  id="founders-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT}
                />
              </div>

              <div>
                <label htmlFor="founders-improve" className={LABEL}>
                  What would you most like to improve in your builds? <span className="text-red-700">*</span>
                </label>
                <textarea
                  id="founders-improve"
                  name="improvementQuestion"
                  rows={4}
                  required
                  value={improvementQuestion}
                  onChange={(e) => setImprovementQuestion(e.target.value)}
                  className={`${INPUT} min-h-[120px] py-3`}
                />
              </div>

              {error ? (
                <p className="text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[52px] w-full rounded-xl bg-stone-900 px-6 text-base font-semibold text-[#f4f3f0] shadow-sm transition hover:bg-stone-800 active:translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f0eeeb] disabled:opacity-60"
                >
                  {loading ? "Sending…" : "Apply now"}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-300/70 py-8 text-center text-sm text-stone-600">
        <Link href="/" className="underline-offset-4 hover:text-stone-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500">
          Back to Phase
        </Link>
      </footer>
    </div>
  )
}
