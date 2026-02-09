"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Bell, ChevronLeft } from "lucide-react"
import { Navigation } from "@/components/navigation"

export default function MyScheduleUpdatesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin")
      return
    }
    if (session?.user?.role !== "Subcontractor") {
      router.push("/")
      return
    }
  }, [session?.user?.role, status, router])

  if (status === "loading" || (status === "authenticated" && session?.user?.role !== "Subcontractor")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9]">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24 pt-20">
      <div className="app-container px-4">
        <header className="mb-4 flex items-center justify-between">
          <Link
            href="/my-schedule"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Phase
          </Link>
          <button
            type="button"
            className="rounded-full p-2 text-muted-foreground hover:bg-white"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>
        </header>

        <h1 className="text-2xl font-bold text-foreground">Updates</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Notifications and schedule updates will appear here.
        </p>

        <div className="mt-8 rounded-2xl border border-[#E6E8EF] bg-white p-8 text-center shadow-sm">
          <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            No updates yet
          </p>
        </div>
      </div>
      <Navigation />
    </div>
  )
}
