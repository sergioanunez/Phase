"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { Home, Calendar, BarChart3, Clock, Bell, Building2, ListChecks, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export function Navigation() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [impersonationRole, setImpersonationRole] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/super-admin/impersonation/context")
      .then((res) => res.json())
      .then((data) => setImpersonationRole(data.active && data.role ? data.role : null))
      .catch(() => setImpersonationRole(null))
  }, [])

  // When impersonating, show nav for the impersonated role; otherwise use session role
  const role = impersonationRole ?? session?.user?.role ?? ""

  if (!session?.user) return null

  const [assistantJustActivated, setAssistantJustActivated] = useState(false)

  useEffect(() => {
    if (pathname?.startsWith("/assistant")) {
      setAssistantJustActivated(true)
      const timer = setTimeout(() => setAssistantJustActivated(false), 800)
      return () => clearTimeout(timer)
    }
  }, [pathname])

  const navItems =
    role === "SUPER_ADMIN"
      ? [{ href: "/super-admin", icon: Building2, label: "Super Admin" }]
      : role === "Subcontractor"
        ? [
            { href: "/my-schedule", icon: Clock, label: "My Schedule" },
            { href: "/my-schedule/updates", icon: Bell, label: "Updates" },
          ]
        : [
            { href: "/homes", icon: Home, label: "Homes", roles: ["Admin", "Superintendent", "Manager"], dataOnboarding: "homes" },
            { href: "/calendar", icon: Calendar, label: "Calendar", roles: ["Admin", "Superintendent", "Manager"], dataOnboarding: "calendar" },
            { href: "/flow", icon: ListChecks, label: "Flow", roles: ["Admin", "Superintendent", "Manager"], dataOnboarding: "flow" },
            { href: "/dashboard", icon: BarChart3, label: "Dashboard", roles: ["Admin", "Manager"], dataOnboarding: "dashboard" },
            {
              href: "/assistant",
              icon: Sparkles,
              label: "Assistant",
              roles: ["Admin", "Superintendent", "Manager"],
              isAssistant: true,
              dataOnboarding: "assistant",
            },
          ].filter((item) => (item as any).roles?.includes(role))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200/80 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] sm:left-1/2 sm:right-auto sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:rounded-t-2xl md:max-w-2xl lg:max-w-3xl">
      <div className="flex justify-around">
        {navItems.map((item) => {
          const Icon = item.icon as React.ComponentType<{ className?: string }>
          const isAssistant = (item as any).isAssistant
          const isActive =
            pathname === item.href ||
            (item.href === "/homes" && pathname?.startsWith("/homes/")) ||
            (item.href === "/flow" && pathname?.startsWith("/flow")) ||
            (item.href === "/assistant" && pathname?.startsWith("/assistant"))
          return (
            <Link
              key={item.href}
              href={item.href}
              {...((item as any).dataOnboarding ? { "data-onboarding": (item as any).dataOnboarding } : {})}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-3 text-[11px] transition-colors",
                isAssistant
                  ? isActive
                    ? "text-sky-600"
                    : "text-sky-600/80 hover:text-sky-700"
                  : isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  isAssistant && isActive && assistantJustActivated && "animate-assistant-sparkle"
                )}
              />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
