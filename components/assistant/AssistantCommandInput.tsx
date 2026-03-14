"use client"

import { useState, useRef, useCallback } from "react"
import { Mic, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VoiceListeningOverlay } from "./VoiceListeningOverlay"

const EXAMPLE_LINES = [
  "Schedule drywall for 652 Paseo next Tuesday",
  "Create a punchlist for 14409 Raywood",
  "What homes are behind schedule",
]

type Props = {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  /** When provided, input is controlled (e.g. for quick prompt injection). */
  value?: string
  onChange?: (value: string) => void
}

export function AssistantCommandInput({
  onSend,
  disabled = false,
  placeholder = "Ask Assistant about your schedule or tell it what to do.",
  value: controlledValue,
  onChange: controlledOnChange,
}: Props) {
  const [internalInput, setInternalInput] = useState("")
  const [showVoice, setShowVoice] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const isControlled = controlledValue !== undefined
  const input = isControlled ? controlledValue : internalInput
  const setInput = isControlled ? (controlledOnChange ?? (() => {})) : setInternalInput

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setInput("")
  }, [input, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleVoiceTranscript = useCallback((text: string) => {
    if (text && !text.startsWith("(")) setInput((prev) => (prev ? `${prev} ${text}` : text))
    setShowVoice(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  return (
    <>
      <div className="sticky bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-10 flex-1"
            aria-label="Assistant command"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setShowVoice(true)}
            disabled={disabled}
            aria-label="Voice input"
          >
            <Mic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="shrink-0 bg-sky-600 hover:bg-sky-700"
            onClick={handleSend}
            disabled={disabled || !input.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Examples:</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {EXAMPLE_LINES.map((line) => (
            <button
              key={line}
              type="button"
              className="hover:text-foreground hover:underline"
              onClick={() => {
                setInput(line)
                inputRef.current?.focus()
              }}
            >
              {line}
            </button>
          ))}
        </div>
      </div>
      {showVoice && (
        <VoiceListeningOverlay
          onClose={() => setShowVoice(false)}
          onTranscript={handleVoiceTranscript}
        />
      )}
    </>
  )
}
