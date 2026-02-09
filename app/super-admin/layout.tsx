"use client"

import { useSession } from "next-auth/react"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { LayoutDashboard, Building2, MessageSquare, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { ImpersonationBanner } from "@/components/impersonation-banner"

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (session?.user?.role !== "SUPER_ADMIN") {
      router.push("/")
    }
  }, [session, router])

  if (session?.user?.role !== "SUPER_ADMIN") {
    return null
  }

  const nav = [
    { href: "/super-admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/super-admin/companies", label: "Companies", icon: Building2 },
    { href: "/super-admin/sms", label: "SMS Health", icon: MessageSquare },
    { href: "/super-admin/audit", label: "Audit Logs", icon: FileText },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <ImpersonationBanner />
      <div className="flex flex-col md:flex-row min-h-screen">
        <aside className="w-full md:w-56 border-b md:border-b-0 md:border-r border-gray-200 bg-white shrink-0">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-sm text-gray-700">Super Admin</h2>
          </div>
          <nav className="p-2 space-y-0.5">
            {nav.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || (item.href !== "/super-admin" && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>
        <main className="flex-1 p-4 md:p-6 overflow-auto pb-24 md:pb-6">
          {children}
        </main>
      </div>
    </div>
  )
}
