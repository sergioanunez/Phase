"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { LandingNav } from "@/components/landing/landing-nav"
import { LandingFooter } from "@/components/landing/landing-footer"

const VOLUME_OPTIONS = [
  { value: "", label: "Select a range (optional)" },
  { value: "1-20", label: "1–20 homes per year" },
  { value: "21-100", label: "21–100 homes per year" },
  { value: "100+", label: "100+ homes per year" },
]

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  "white-label": "White Label",
}

export default function ContactPage() {
  const searchParams = useSearchParams()
  const planParam = useMemo(
    () => (searchParams?.get("plan") || "").toLowerCase().replace(/\s+/g, "-"),
    [searchParams]
  )
  const planLabel = planParam && PLAN_LABELS[planParam] ? PLAN_LABELS[planParam] : null

  const [companyName, setCompanyName] = useState("")
  const [volume, setVolume] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/contact/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          volumePerYear: volume || undefined,
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.")
        setLoading(false)
        return
      }
      setSuccess(true)
      setCompanyName("")
      setVolume("")
      setPhone("")
      setEmail("")
      setNotes("")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <LandingNav />
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Request a Phase Demo
        </h1>
        <p className="mt-3 text-base text-gray-600">
          Tell us a bit about your operation and we&apos;ll reach out.
        </p>
        {planLabel && (
          <p className="mt-2 text-sm font-medium text-[primary]">
            You&apos;re requesting a demo for the <strong>{planLabel}</strong> plan.
          </p>
        )}

        {success ? (
          <div className="mt-10 rounded-2xl border border-[#E6E8EF] bg-white p-8 shadow-sm">
            <p className="text-lg font-medium text-gray-900">
              Thanks! We&apos;ll be in touch shortly.
            </p>
            <p className="mt-2 text-sm text-gray-600">
              We&apos;ve received your demo request and will contact you at the email you provided.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-900">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                id="companyName"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-2 block min-h-[48px] w-full rounded-xl border border-[#E6E8EF] bg-white px-4 text-gray-900 shadow-sm focus:border-[primary] focus:outline-none focus:ring-2 focus:ring-[primary]/20"
                placeholder="Your company name"
              />
            </div>
            <div>
              <label htmlFor="volume" className="block text-sm font-medium text-gray-900">
                Homes Built Per Year
              </label>
              <select
                id="volume"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="mt-2 block min-h-[48px] w-full rounded-xl border border-[#E6E8EF] bg-white px-4 text-gray-900 shadow-sm focus:border-[primary] focus:outline-none focus:ring-2 focus:ring-[primary]/20"
              >
                {VOLUME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Approximate number</p>
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-900">
                Contact Number <span className="text-red-500">*</span>
              </label>
              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-2 block min-h-[48px] w-full rounded-xl border border-[#E6E8EF] bg-white px-4 text-gray-900 shadow-sm focus:border-[primary] focus:outline-none focus:ring-2 focus:ring-[primary]/20"
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-900">
                Contact Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 block min-h-[48px] w-full rounded-xl border border-[#E6E8EF] bg-white px-4 text-gray-900 shadow-sm focus:border-[primary] focus:outline-none focus:ring-2 focus:ring-[primary]/20"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-900">
                Notes / Comments
              </label>
              <textarea
                id="notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2 block w-full rounded-xl border border-[#E6E8EF] bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-[primary] focus:outline-none focus:ring-2 focus:ring-[primary]/20"
                placeholder="Anything else you'd like us to know..."
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="min-h-[48px] w-full rounded-xl bg-[primary] px-6 text-base font-semibold text-white hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-[primary] focus:ring-offset-2 disabled:opacity-70"
              >
                {loading ? "Sending…" : "Request Demo"}
              </button>
            </div>
          </form>
        )}
      </main>
      <LandingFooter />
    </div>
  )
}
