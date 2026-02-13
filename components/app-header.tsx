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
  const [notificationCount, setNotificationCount] = useState<number>(0)

  useEffect(() => {
    if (pathname?.startsWith("/auth") || pathname === "/" || pathname === "/contact") return
    fetch("/api/company/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setBranding({ pricingTier: data.pricingTier, logoUrl: data.logoUrl || null, brandAppName: data.brandAppName || null }))
      .catch(() => setBranding(null))
  }, [pathname])

  useEffect(() => {
    if (pathname?.startsWith("/auth") || pathname === "/" || pathname === "/contact") return
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data) => setNotificationCount(data.count ?? 0))
      .catch(() => setNotificationCount(0))
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
        <Link
          href="/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-gray-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          aria-label={notificationCount > 0 ? `${notificationCount} notifications` : "Notifications"}
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
