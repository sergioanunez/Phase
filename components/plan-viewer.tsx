"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X, RefreshCw, FileWarning } from "lucide-react"

interface PlanViewerProps {
  homeId: string
  addressOrLot: string
  planName?: string | null
  planVariant?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface PlanResponse {
  exists: boolean
  planName?: string | null
  planVariant?: string | null
  planFileType?: "PDF" | "IMAGE"
  signedUrl?: string
  uploadedAt?: string | null
  uploadedBy?: { id: string; name: string } | null
}

export function PlanViewer({
  homeId,
  addressOrLot,
  planName: initialPlanName,
  planVariant: initialPlanVariant,
  open,
  onOpenChange,
}: PlanViewerProps) {
  const [data, setData] = useState<PlanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageLoadError, setImageLoadError] = useState(false)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const lastPinchDist = useRef<number | null>(null)
  const lastPinchCenter = useRef<{ x: number; y: number } | null>(null)

  const fetchPlan = useCallback(async () => {
    setLoading(true)
    setError(null)
    setImageLoadError(false)
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    try {
      const res = await fetch(`/api/homes/${homeId}/plan`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Failed to load plan")
        setData(null)
        return
      }
      setData(json)
    } catch (err: any) {
      setError(err.message || "Failed to load plan")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [homeId])

  useEffect(() => {
    if (open && homeId) {
      fetchPlan()
    }
  }, [open, homeId, fetchPlan])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setScale((s) => Math.min(5, Math.max(0.3, s + delta)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - translate.x, y: e.clientY - translate.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setTranslate({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      )
      lastPinchDist.current = dist
      lastPinchCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
    } else if (e.touches.length === 1) {
      setDragStart({
        x: e.touches[0].clientX - translate.x,
        y: e.touches[0].clientY - translate.y,
      })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null && lastPinchCenter.current) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      )
      const delta = dist / lastPinchDist.current
      setScale((s) => Math.min(5, Math.max(0.3, s * delta)))
      lastPinchDist.current = dist
    } else if (e.touches.length === 1) {
      setTranslate({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      })
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) lastPinchDist.current = null
  }

  const displayName = [data?.planName ?? initialPlanName, data?.planVariant ?? initialPlanVariant]
    .filter(Boolean)
    .join(" – ") || "Floor Plan"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-full h-[100dvh] p-0 gap-0 overflow-hidden bg-black/95 border-0 rounded-none">
        <DialogHeader className="sr-only">
          <DialogTitle>Floor Plan: {addressOrLot}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-2 bg-black/80 text-white shrink-0">
            <div className="min-w-0">
              <p className="font-medium truncate">{addressOrLot}</p>
              <p className="text-sm text-white/80 truncate">{displayName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {data?.exists && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/20"
                  onClick={fetchPlan}
                  disabled={loading}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh link
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                Loading plan...
              </div>
            )}
            {error && (
              <div className="flex flex-col items-center gap-3 text-white text-center p-4">
                <FileWarning className="h-12 w-12 text-white/70" />
                <p>{error}</p>
                <Button variant="secondary" onClick={fetchPlan} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            )}
            {!loading && !error && data?.exists && data.signedUrl && (
              <>
                {data.planFileType === "IMAGE" ? (
                  <div
                    ref={containerRef}
                    className="absolute inset-0 overflow-hidden touch-none"
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    style={{ cursor: isDragging ? "grabbing" : "grab" }}
                  >
                    {imageLoadError ? (
                      <div className="flex flex-col items-center justify-center h-full text-white gap-2">
                        <FileWarning className="h-10 w-10" />
                        <p>Image could not be loaded. Link may have expired.</p>
                        <Button variant="secondary" size="sm" onClick={fetchPlan}>
                          Refresh link
                        </Button>
                      </div>
                    ) : (
                      <img
                        src={data.signedUrl}
                        alt={displayName}
                        className="select-none max-w-none origin-center"
                        style={{
                          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                          pointerEvents: "none",
                        }}
                        draggable={false}
                        onError={() => setImageLoadError(true)}
                      />
                    )}
                  </div>
                ) : (
                  <iframe
                    src={data.signedUrl}
                    title={displayName}
                    className="w-full h-full border-0 bg-white"
                    onError={() => setError("Failed to load PDF")}
                  />
                )}
              </>
            )}
            {!loading && !error && data && !data.exists && (
              <div className="text-white/80 text-center p-4">
                No floor plan has been uploaded for this home.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
