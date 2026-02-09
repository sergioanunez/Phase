"use client"

import { useState, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X, ZoomIn, ZoomOut } from "lucide-react"

interface ImageViewerProps {
  imageUrl: string | null
  title?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImageViewer({
  imageUrl,
  title,
  open,
  onOpenChange,
}: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const lastPinchDist = useRef<number | null>(null)

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setScale((s) => Math.min(4, Math.max(0.25, s + delta)))
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
      lastPinchDist.current = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      )
    } else if (e.touches.length === 1) {
      setDragStart({
        x: e.touches[0].clientX - translate.x,
        y: e.touches[0].clientY - translate.y,
      })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      )
      const delta = dist / lastPinchDist.current
      setScale((s) => Math.min(4, Math.max(0.25, s * delta)))
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

  const zoomIn = () => setScale((s) => Math.min(4, s + 0.25))
  const zoomOut = () => setScale((s) => Math.max(0.25, s - 0.25))
  const resetView = () => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setScale(1)
      setTranslate({ x: 0, y: 0 })
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[100vw] w-full h-[100dvh] p-0 gap-0 overflow-hidden bg-black/95 border-0 rounded-none">
        <DialogHeader className="sr-only">
          <DialogTitle>{title ?? "Image"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-2 bg-black/80 text-white shrink-0">
            {title && <p className="font-medium truncate min-w-0 flex-1 mr-2">{title}</p>}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
                onClick={zoomOut}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20 min-w-[4rem]"
                onClick={resetView}
              >
                {Math.round(scale * 100)}%
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
                onClick={zoomIn}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => handleOpenChange(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden relative">
            {imageUrl && (
              <div
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
                <img
                  src={imageUrl}
                  alt={title ?? "Image"}
                  className="select-none max-w-none origin-center"
                  style={{
                    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                    pointerEvents: "none",
                  }}
                  draggable={false}
                />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
