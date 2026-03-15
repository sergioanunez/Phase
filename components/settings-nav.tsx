"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Palette, CreditCard } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs: Array<{
  value: string
  href: string
  label: string
  icon?: typeof Palette
  dataOnboarding?: string
}> = [
  { value: "subdivisions-homes", href: "/admin", label: "Subdivisions & Homes", dataOnboarding: "subdivisions" },
  { value: "work-templates", href: "/admin?tab=work-templates", label: "Work Items Template", dataOnboarding: "template" },
  { value: "contractors", href: "/admin?tab=contractors", label: "Vendors", dataOnboarding: "contractors" },
  { value: "users", href: "/admin?tab=users", label: "Users", dataOnboarding: "team" },
  { value: "white-label", href: "/admin?tab=white-label", label: "White Label", icon: Palette },
  { value: "billing", href: "/admin/billing", label: "Billing", icon: CreditCard },
]

export function SettingsNav({ className }: { className?: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  const isBillingActive = pathname === "/admin/billing"
  const isActive = (t: (typeof tabs)[number]): boolean =>
    t.value === "billing"
      ? isBillingActive
      : pathname === "/admin" && (tabParam === t.value || (!tabParam && t.value === "subdivisions-homes"))

  return (
    <nav className={cn("flex flex-wrap gap-2", className)} role="tablist" aria-label="Settings sections">
      {tabs.map((t) => {
        const Icon = t.icon
        const active = isActive(t)
        return (
          <Link
            key={t.value}
            href={t.href}
            role="tab"
            aria-selected={active}
            {...(t.dataOnboarding ? { "data-onboarding": t.dataOnboarding } : {})}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {Icon && <Icon className="h-4 w-4 mr-1.5" />}
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
