"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { Bell, ArrowLeft } from "lucide-react"
import logoImage from "../public/logo.png"
import { UserMenu } from "@/components/user-menu"
import { TrialBanner } from "@/components/billing/trial-banner"
import { getTenantBrandColor } from "@/lib/tenant/theme"

type Branding = {
  pricingTier: string
  logoUrl: string | null
  brandAppName: string | null
  brandingUpdatedAt?: string
  brandPrimaryColor?: string | null
  whiteLabelEnabled?: boolean
  whiteLabelExperienceEnabled?: boolean
} | null

export function AppHeader() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [branding, setBranding] = useState<Branding>(null)
  const [notificationCount, setNotificationCount] = useState<number>(0)

  // Subcontractor experience: Phase branding only; never builder white-label logo.
  const isSubcontractor =
    session?.user?.role === "Subcontractor"
  // Contractor schedule / my-week routes also skip tenant branding (pathname guard before session hydrates).
  const isContractorScheduleRoute =
    pathname?.startsWith("/my-schedule") || pathname?.startsWith("/my-week")
  const usePhaseBrandingOnly = isSubcontractor || isContractorScheduleRoute

  useEffect(() => {
    if (
      pathname?.startsWith("/auth") ||
      pathname === "/" ||
      pathname === "/contact" ||
      pathname === "/founders10" ||
      pathname?.startsWith("/super-admin") ||
      pathname?.startsWith("/punchlist") ||
      usePhaseBrandingOnly
    )
      return
    fetch("/api/company/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data) =>
          data &&
          setBranding({
            pricingTier: data.pricingTier,
            logoUrl: data.logoUrl || null,
            brandAppName: data.brandAppName || null,
            brandingUpdatedAt: data.brandingUpdatedAt,
            brandPrimaryColor: data.brandPrimaryColor ?? null,
            whiteLabelEnabled: data.whiteLabelEnabled ?? false,
            whiteLabelExperienceEnabled:
              data.whiteLabelExperienceEnabled ?? data.whiteLabelEnabled ?? false,
          })
      )
      .catch(() => setBranding(null))
  }, [pathname, usePhaseBrandingOnly])

  useEffect(() => {
    if (
      pathname?.startsWith("/auth") ||
      pathname === "/" ||
      pathname === "/contact" ||
      pathname === "/founders10" ||
      pathname?.startsWith("/super-admin") ||
      pathname?.startsWith("/punchlist")
    )
      return
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data) => setNotificationCount(data.count ?? 0))
      .catch(() => setNotificationCount(0))
  }, [pathname])

  if (
    pathname?.startsWith("/auth") ||
    pathname === "/" ||
    pathname === "/contact" ||
    pathname === "/founders10" ||
    pathname?.startsWith("/super-admin") ||
    pathname?.startsWith("/punchlist")
  ) {
    return null
  }

  const useCustomLogo =
    !usePhaseBrandingOnly && branding?.pricingTier === "WHITE_LABEL" && branding?.logoUrl
  const logoAlt = useCustomLogo && branding?.brandAppName ? branding.brandAppName : "Phase"
  const logoHref = isSubcontractor
    ? "/my-schedule"
    : pathname === "/start-trial"
      ? "/"
      : "/homes"

  const beltColor = usePhaseBrandingOnly
    ? "#ffffff"
    : getTenantBrandColor({
        whiteLabelEnabled: branding?.whiteLabelExperienceEnabled,
        brandPrimaryColor: branding?.brandPrimaryColor,
      })

  const isGanttPage = pathname === "/admin/templates/gantt"

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-white shadow-sm">
      <TrialBanner />
      <div className="app-header-nav-width mx-auto flex h-16 w-full items-center justify-between px-4 sm:px-6 md:px-8">
        <div className="flex flex-shrink-0 items-center gap-3">
          {isGanttPage && (
            <Link
              href="/admin?tab=work-templates"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Exit to Work Templates
            </Link>
          )}
          <Link href={logoHref} className="hover:opacity-80 transition-opacity flex flex-shrink-0 items-center">
          {useCustomLogo ? (
            <img
              src={
                branding?.brandingUpdatedAt
                  ? `${branding.logoUrl ?? ""}?v=${new Date(branding.brandingUpdatedAt).getTime()}`
                  : branding?.logoUrl ?? ""
              }
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
        </div>
        <div className="flex items-center gap-3 pr-2 sm:pr-3 md:pr-6">
          <Link
            href="/notifications"
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label={notificationCount > 0 ? `${notificationCount} notifications` : "Notifications"}
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </Link>
          <UserMenu />
        </div>
      </div>
      <div
        className="h-1 w-full"
        style={{ backgroundColor: beltColor }}
        aria-hidden="true"
      />
    </header>
  )
}

