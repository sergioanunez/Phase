"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Menu, X } from "lucide-react"

import logoImage from "../../public/logo.png"

const NAV_LINKS = [
  { href: "#benefits", label: "Benefits" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#screens", label: "Screens" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
]

export function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 left-0 right-0 z-50 border-b border-[#E6E8EF] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md"
          aria-label="BuildFlow home"
        >
          <div className="relative flex h-9 w-28 items-center sm:h-10 sm:w-32 md:h-[3.2rem] md:w-48 lg:h-[3.2rem] lg:w-52">
            <Image
              src={logoImage}
              alt="Phase"
              fill
              className="object-contain object-left"
              priority
              quality={90}
              sizes="(min-width: 1024px) 416px, (min-width: 768px) 384px, 256px"
            />
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/auth/signin"
            className="min-h-[44px] inline-flex items-center justify-center rounded-lg px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Login Area
          </Link>
          <Link
            href="/start-trial"
            className="min-h-[44px] inline-flex items-center justify-center rounded-lg bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2"
          >
            Start free trial
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 md:hidden focus:outline-none focus:ring-2 focus:ring-primary"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile nav */}
      <div
        id="mobile-nav"
        className={`md:hidden border-t border-[#E6E8EF] bg-white ${mobileOpen ? "block" : "hidden"}`}
      >
        <nav className="mx-auto max-w-6xl px-4 py-4 space-y-1" aria-label="Main mobile">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="block min-h-[44px] py-3 text-sm font-medium text-gray-700 hover:text-gray-900 rounded-lg px-3 hover:bg-gray-50"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="pt-4 space-y-2 border-t border-gray-100">
            <Link
              href="/auth/signin"
              className="flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700"
              onClick={() => setMobileOpen(false)}
            >
              Login Area
            </Link>
            <Link
              href="/start-trial"
              className="flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Start free trial
            </Link>
          </div>
        </nav>
      </div>
    </header>
  )
}
