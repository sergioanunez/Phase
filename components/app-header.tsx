"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell } from "lucide-react"
import logoImage from "../public/logo.png"

type Branding = { pricingTier: string; logoUrl: string | null; brandAppName: string | null; brandingUpdatedAt?: string } | null

export function AppHeader() {
  const pathname = usePathname()
  const [branding, setBranding] = useState<Branding>(null)

  useEffect(() => {
    if (pathname?.startsWith("/auth") || pathname === "/" || pathname === "/contact") return
    fetch("/api/company/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setBranding({ pricingTier: data.pricingTier, logoUrl: data.logoUrl || null, brandAppName: data.brandAppName || null }))
      .catch(() => setBranding(null))
  }, [pathname])

  if (pathname?.startsWith("/auth") || pathname === "/" || pathname === "/contact") {
    return null
  }

  const useCustomLogo = branding?.pricingTier === "WHITE_LABEL" && branding?.logoUrl
  const logoAlt = (useCustomLogo && branding?.brandAppName) ? branding.brandAppName : "Phase"

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-white shadow-sm">
      <div className="app-header-nav-width mx-auto flex h-16 w-full items-center justify-between px-4 sm:px-6 md:px-8">
        <Link href="/homes" className="hover:opacity-80 transition-opacity flex flex-shrink-0 items-center">
          {useCustomLogo ? (
            <img
              src={branding.brandingUpdatedAt ? `${branding.logoUrl ?? ""}?v=${new Date(branding.brandingUpdatedAt).getTime()}` : (branding.logoUrl ?? "")}
              alt={logoAlt}
              className="h-12 w-auto max-w-[12rem] object-contain object-left"
            />
          ) : (
            <Image
              src={logoImage}
              alt="Phase"
              width={logoImage.width}
              height={logoImage.height}
              className="h-12 w-auto max-w-[12rem] object-contain object-left"
              priority
              unoptimized
            />
          )}
        </Link>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-gray-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
