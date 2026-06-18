"use client"

import { useEffect, useState, type RefObject } from "react"
import { cn } from "@/lib/utils"

/** Matches app header (nav h-16 + brand belt h-1) and page pt-20 offset. */
const STICKY_TOP_CLASS = "top-20"
/** pt-20 = 5rem; IntersectionObserver rootMargin only accepts px or %. */
const HEADER_OFFSET_PX = 80

export function useHouseHeaderInView(
  headerRef: RefObject<HTMLElement | null>,
  /** Re-attach when the header mounts (e.g. home id after loading). */
  observeKey?: string
) {
  const [headerInView, setHeaderInView] = useState(true)

  useEffect(() => {
    if (!observeKey) return

    let observer: IntersectionObserver | null = null
    let cancelled = false

    const attach = () => {
      const el = headerRef.current
      if (!el || cancelled) return false

      observer = new IntersectionObserver(
        ([entry]) => {
          setHeaderInView(entry?.isIntersecting ?? true)
        },
        {
          threshold: 0,
          rootMargin: `-${HEADER_OFFSET_PX}px 0px 0px 0px`,
        }
      )
      observer.observe(el)
      return true
    }

    if (!attach()) {
      const frame = requestAnimationFrame(() => {
        attach()
      })
      return () => {
        cancelled = true
        cancelAnimationFrame(frame)
        observer?.disconnect()
      }
    }

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [headerRef, observeKey])

  return headerInView
}

export function HouseDetailStickyAddress({
  address,
  show,
  onScrollToTop,
}: {
  address: string
  show: boolean
  onScrollToTop: () => void
}) {
  return (
    <div
      className={cn(
        "fixed left-0 right-0 z-[35] border-b border-border/80 bg-white/95 shadow-sm backdrop-blur-sm transition-[opacity,transform] duration-200 ease-out",
        STICKY_TOP_CLASS,
        show
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-0.5 opacity-0"
      )}
      aria-hidden={!show}
    >
      <div className="app-container px-4 sm:px-6 md:px-8">
        <button
          type="button"
          onClick={onScrollToTop}
          title="Back to top"
          className={cn(
            "flex h-12 w-full min-w-0 items-center text-left",
            show && "cursor-pointer hover:bg-muted/40 active:bg-muted/60"
          )}
        >
          <span className="truncate text-base font-semibold text-foreground">{address}</span>
        </button>
      </div>
    </div>
  )
}
