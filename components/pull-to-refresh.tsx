"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

const PUBLIC_PATHS = ["/", "/contact", "/start-trial", "/founders10"]
const PULL_THRESHOLD = 72
const PULL_MAX = 120
const RESISTANCE = 0.45

function isAppRoute(pathname: string | null): boolean {
  if (!pathname) return false
  if (pathname.startsWith("/auth") || pathname.startsWith("/punchlist")) return false
  if (PUBLIC_PATHS.some((p) => pathname === p)) return false
  return true
}

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [transition, setTransition] = useState(false)
  const startY = useRef(0)
  const startScrollY = useRef(0)
  const pulling = useRef(false)

  const enabled = isAppRoute(pathname)

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return
      startY.current = e.touches[0].clientY
      startScrollY.current = window.scrollY
      pulling.current = false
    },
    [enabled]
  )

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return
      const scrollY = window.scrollY
      const y = e.touches[0].clientY
      const dy = y - startY.current

      if (scrollY <= 0 && dy > 0) {
        if (!pulling.current) pulling.current = true
        e.preventDefault()
        const resisted = Math.min(dy * RESISTANCE, PULL_MAX)
        setPull(resisted)
        setTransition(false)
      }
    },
    [enabled]
  )

  const handleTouchEnd = useCallback(() => {
    if (!enabled) return
    if (pull <= 0) {
      pulling.current = false
      return
    }

    if (pull >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true)
      setTransition(true)
      setPull(0)
      pulling.current = false
      router.refresh()
      const t = setTimeout(() => setRefreshing(false), 600)
      return () => clearTimeout(t)
    }

    setTransition(true)
    setPull(0)
    pulling.current = false
  }, [enabled, pull, refreshing, router])

  useEffect(() => {
    if (!enabled) return
    window.addEventListener("touchstart", handleTouchStart, { passive: true })
    window.addEventListener("touchmove", handleTouchMove, { passive: false })
    window.addEventListener("touchend", handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener("touchstart", handleTouchStart)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchend", handleTouchEnd)
    }
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd])

  if (!enabled) return <>{children}</>

  return (
    <>
      <div
        className="pointer-events-none fixed left-0 right-0 top-0 z-[100] flex justify-center transition-opacity duration-200"
        style={{
          height: PULL_THRESHOLD,
          opacity: pull > 0 || refreshing ? 1 : 0,
          transform: `translateY(${refreshing ? 0 : Math.min(pull, PULL_THRESHOLD)}px)`,
        }}
        aria-hidden
      >
        <div className="flex flex-col items-center gap-1 pt-2">
          {refreshing ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <div
              className="rounded-full border-2 border-primary/40 bg-background/80 p-1.5 shadow-sm"
              style={{
                transform: `rotate(${Math.min((pull / PULL_THRESHOLD) * 360, 360)}deg)`,
              }}
            >
              <svg
                className="h-5 w-5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </div>
          )}
          <span className="text-xs font-medium text-muted-foreground">
            {refreshing ? "Refreshing…" : pull >= PULL_THRESHOLD ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      </div>
      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: transition ? "transform 0.25s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </>
  )
}
