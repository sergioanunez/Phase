"use client"

import { useEffect, useRef } from "react"

type Props = {
  onClose: () => void
  onTranscript: (text: string) => void
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function VoiceListeningOverlay({ onClose, onTranscript }: Props) {
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })["webkitSpeechRecognition"])
    if (!SpeechRecognition) {
      onTranscript("(Speech recognition not supported in this browser)")
      onClose()
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = "en-US"
    recognitionRef.current = recognition

    let finalTranscript = ""

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interim += transcript
        }
      }
      if (interim) {
        onTranscript((finalTranscript + interim).trim())
      }
    }

    recognition.onend = () => {
      if (finalTranscript) onTranscript(finalTranscript.trim())
      onClose()
    }

    recognition.onerror = () => {
      onClose()
    }

    recognition.start()
    return () => {
      try {
        recognition.abort()
      } catch {}
      recognitionRef.current = null
    }
  }, [onClose, onTranscript])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-live="polite"
      aria-label="Listening for voice input"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="rounded-xl bg-white px-8 py-6 shadow-xl">
        <p className="text-center text-lg font-semibold text-foreground">Listening…</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Speak your command, then tap outside to insert into the input.
        </p>
        {!prefersReducedMotion() && (
          <div className="mt-4 flex items-center justify-center gap-1" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-2 w-1 rounded-full bg-sky-500 animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
