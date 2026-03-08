"use client"

import { useState } from "react"
import { Send, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ChatAskBlock } from "@/lib/types"

interface ChatAskWidgetProps {
  block: ChatAskBlock
  onSubmit: (requestId: string, value: string) => void
}

export function ChatAskWidget({ block, onSubmit }: ChatAskWidgetProps) {
  const [textValue, setTextValue] = useState("")
  const [selectedMulti, setSelectedMulti] = useState<Set<string>>(new Set())

  const answered = block.answered

  const handleSubmit = () => {
    if (answered) return
    let value = ""
    if (block.inputType === "text") value = textValue.trim()
    else if (block.inputType === "multi_choice") value = Array.from(selectedMulti).join(", ")
    if (!value) return
    onSubmit(block.requestId, value)
  }

  if (answered) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl px-4 py-3 text-sm">
        <p className="text-muted-foreground text-xs mb-1">{block.question}</p>
        <div className="flex items-center gap-1.5 text-foreground font-medium">
          <Check className="size-3.5 text-zinc-400 shrink-0" />
          {block.answer}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-foreground">{block.question}</p>

      {block.inputType === "text" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
            placeholder="Type your answer…"
            className="flex-1 bg-background border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 transition-all"
            autoFocus
          />
          <Button size="sm" variant="outline" onClick={handleSubmit} disabled={!textValue.trim()}>
            <Send className="size-3.5" />
          </Button>
        </div>
      )}

      {block.inputType === "single_choice" && (
        <div className="space-y-1.5">
          {block.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onSubmit(block.requestId, opt)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm bg-background border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {block.inputType === "multi_choice" && (
        <div className="space-y-1.5">
          {block.options.map((opt) => {
            const selected = selectedMulti.has(opt)
            return (
              <button
                key={opt}
                onClick={() => setSelectedMulti((prev) => {
                  const next = new Set(prev)
                  if (next.has(opt)) next.delete(opt); else next.add(opt)
                  return next
                })}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                  selected
                    ? "bg-zinc-200 dark:bg-zinc-700 border-zinc-400 dark:border-zinc-500 text-foreground"
                    : "bg-background border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {opt}
              </button>
            )
          })}
          {selectedMulti.size > 0 && (
            <Button size="sm" variant="outline" className="mt-1" onClick={handleSubmit}>
              Confirm ({selectedMulti.size} selected)
            </Button>
          )}
        </div>
      )}

      {block.inputType === "confirmation" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSubmit(block.requestId, "Yes")}>
            Yes
          </Button>
          <Button size="sm" variant="outline" onClick={() => onSubmit(block.requestId, "No")}>
            No
          </Button>
        </div>
      )}
    </div>
  )
}
