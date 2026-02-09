"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { Home, Calendar, BarChart3, Clock, Settings, Bell, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function Navigation() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = session?.user?.role ?? ""

  if (!session?.user) return null

  const navItems =
    role === "SUPER_ADMIN"
      ? [{ href: "/super-admin", icon: Building2, label: "Super Admin" }]
      : role === "Subcontractor"
        ? [
            { href: "/my-schedule", icon: Clock, label: "My Schedule" },
            { href: "/my-schedule/updates", icon: Bell, label: "Updates" },
          ]
        : [
            { href: "/homes", icon: Home, label: "Homes", roles: ["Admin", "Superintendent", "Manager"] },
            { href: "/calendar", icon: Calendar, label: "Calendar", roles: ["Admin", "Superintendent", "Manager"] },
            { href: "/dashboard", icon: BarChart3, label: "Dashboard", roles: ["Admin", "Manager"] },
            { href: "/admin", icon: Settings, label: "Admin", roles: ["Admin"] },
          ].filter((item) => item.roles.includes(role))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200/80 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] sm:left-1/2 sm:right-auto sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:rounded-t-2xl md:max-w-2xl lg:max-w-3xl">
      <div className="flex justify-around">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            pathname === item.href ||
            (item.href === "/homes" && pathname?.startsWith("/homes/"))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-4 py-3 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
