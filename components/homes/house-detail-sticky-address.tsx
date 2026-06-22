"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

/** Compact context bar height (44–48px range). */
export const HOUSE_STICKY_ADDRESS_BAR_HEIGHT_PX = 46

/** Default: nav h-16 (64px) + brand belt h-1 (4px). */
const DEFAULT_APP_HEADER_HEIGHT_PX = 68

function useAppHeaderHeight(): number {
  const [height, setHeight] = useState(DEFAULT_APP_HEADER_HEIGHT_PX)

  useEffect(() => {
    const header = document.getElementById("app-header")
    if (!header) return

    const update = () => {
      setHeight(Math.round(header.getBoundingClientRect().height))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  return height
}

export function useHouseHeaderInView(
  element: HTMLElement | null,
  /** Re-attach when the header mounts (e.g. home id after loading). */
  observeKey?: string
) {
  const appHeaderHeight = useAppHeaderHeight()
  const [headerInView, setHeaderInView] = useState(true)

  const stickyOffset = appHeaderHeight + HOUSE_STICKY_ADDRESS_BAR_HEIGHT_PX

  useEffect(() => {
    if (!observeKey || !element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHeaderInView(entry?.isIntersecting ?? true)
      },
      {
        threshold: 0,
        rootMargin: `-${stickyOffset}px 0px 0px 0px`,
      }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [element, observeKey, stickyOffset])

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
  const [mounted, setMounted] = useState(false)
  const appHeaderHeight = useAppHeaderHeight()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(
    <div
      style={{ top: appHeaderHeight }}
      className={cn(
        "fixed left-0 right-0 z-[35] border-b border-border bg-white transition-opacity duration-200 ease-out",
        show ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
      aria-hidden={!show}
    >
      <div className="app-header-nav-width mx-auto flex items-center px-4 sm:px-6 md:px-8">
        <button
          type="button"
          onClick={onScrollToTop}
          title="Back to top"
          className={cn(
            "flex w-full min-w-0 items-center text-left",
            show && "cursor-pointer active:bg-muted/50"
          )}
          style={{ height: HOUSE_STICKY_ADDRESS_BAR_HEIGHT_PX }}
        >
          <span className="truncate text-[17px] font-semibold leading-none text-foreground">
            {address}
          </span>
        </button>
      </div>
    </div>,
    document.body
  )
}
