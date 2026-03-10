"use client"

import { useEffect, useRef, useState } from "react"

export interface CountUpNumberProps {
  value: number
  durationMs?: number
  startOnMount?: boolean
  className?: string
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function CountUpNumber({
  value,
  durationMs = 700,
  startOnMount = true,
  className,
}: CountUpNumberProps) {
  const [displayValue, setDisplayValue] = useState(startOnMount ? 0 : value)
  const frameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const hasAnimatedRef = useRef(false)

  useEffect(() => {
    if (!startOnMount || hasAnimatedRef.current || prefersReducedMotion()) {
      setDisplayValue(value)
      return
    }

    hasAnimatedRef.current = true

    const animate = (timestamp: number) => {
      if (startTimeRef.current == null) {
        startTimeRef.current = timestamp
      }
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      const nextValue = Math.round(value * eased)
      setDisplayValue(nextValue)
      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(animate)
      }
    }

    frameRef.current = window.requestAnimationFrame(animate)

    return () => {
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [value, durationMs, startOnMount])

  return <span className={className}>{displayValue.toLocaleString()}</span>
}

