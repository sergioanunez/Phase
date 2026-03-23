"use client"

import { useEffect, useState, useCallback } from "react"
import Image from "next/image"
import { useSession } from "next-auth/react"

const SESSION_KEY = "phase_splash_seen_session_v1"
const DAILY_KEY = "phase_splash_seen_day_v1"

type SplashPersistence = "session" | "daily"

const PERSISTENCE: SplashPersistence =
  (process.env.NEXT_PUBLIC_SPLASH_PERSISTENCE as SplashPersistence) === "daily"
    ? "daily"
    : "session"

const MOBILE_MQ = "(max-width: 768px)"

function shouldSkipSplash(): boolean {
  if (typeof window === "undefined") return true
  if (PERSISTENCE === "session") {
    return window.sessionStorage.getItem(SESSION_KEY) === "1"
  }
  const today = new Date().toISOString().slice(0, 10)
  return window.localStorage.getItem(DAILY_KEY) === today
}

function markSplashSeen(): void {
  try {
    if (PERSISTENCE === "session") {
      window.sessionStorage.setItem(SESSION_KEY, "1")
    } else {
      const today = new Date().toISOString().slice(0, 10)
      window.localStorage.setItem(DAILY_KEY, today)
    }
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Lightweight mobile splash: shows Phase logo while auth/session resolves.
 * No artificial delay — hides as soon as session is ready.
 */
export function SplashScreen() {
  const { status } = useSession()
  const [gate, setGate] = useState<"check" | "splash" | "skip">("check")
  const [fadeIn, setFadeIn] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [removed, setRemoved] = useState(false)

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_MQ).matches
    if (!mobile) {
      setGate("skip")
      return
    }
    if (shouldSkipSplash()) {
      setGate("skip")
      return
    }
    setGate("splash")
  }, [])

  useEffect(() => {
    if (gate !== "splash") return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setFadeIn(true))
    })
  }, [gate])

  const beginExit = useCallback(() => {
    markSplashSeen()
    setExiting(true)
  }, [])

  useEffect(() => {
    if (gate !== "splash") return
    if (status === "loading") return
    beginExit()
  }, [gate, status, beginExit])

  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (e.propertyName !== "opacity") return
    if (exiting) {
      setRemoved(true)
    }
  }

  if (gate === "check" || gate === "skip" || removed) return null

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-white transition-opacity duration-200 ease-out ${
        fadeIn && !exiting ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onTransitionEnd={handleTransitionEnd}
      aria-hidden={exiting}
      role="presentation"
    >
      <div className="flex flex-col items-center justify-center px-6">
        <Image
          src="/icon-192.png"
          alt=""
          width={96}
          height={96}
          priority
          className="h-24 w-24 object-contain"
        />
      </div>
    </div>
  )
}
