"use client"

import { useState } from "react"
import { Check, ChevronRight, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ChatFormBlock, FormQuestion } from "@/lib/types"

interface ChatFormWidgetProps {
  block: ChatFormBlock
  onSubmit: (requestId: string, value: string) => void
}

// Auto-submits on selection (no button needed)
const AUTO_ADVANCE_TYPES = new Set(["single_choice", "confirmation"])

// ── Answered state ────────────────────────────────────────────────────────────

function AnsweredView({ block }: { block: ChatFormBlock }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl px-4 py-3 space-y-2.5">
      {block.questions.map((q) => (
        <div key={q.name}>
          <p className="text-muted-foreground text-xs">{q.question}</p>
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mt-0.5">
            <Check className="size-3.5 text-zinc-400 shrink-0" />
            {block.answers?.[q.name] ?? "—"}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Single question input (reused in both modes) ──────────────────────────────

interface QuestionInputProps {
  q: FormQuestion
  value: string
  onChange: (v: string) => void
  onAutoSubmit?: (v: string) => void  // called immediately for selection types
  isLast: boolean
  onNext: () => void
}

function QuestionInput({ q, value, onChange, onAutoSubmit, isLast, onNext }: QuestionInputProps) {
  const [selectedMulti, setSelectedMulti] = useState<Set<string>>(new Set())

  if (q.input_type === "text") {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onNext() }}
          placeholder="Type your answer…"
          className="flex-1 bg-background border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 transition-all"
          autoFocus
        />
        <Button
          size="sm"
          variant="outline"
          onClick={onNext}
          disabled={!value.trim()}
        >
          {isLast ? <Send className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </Button>
      </div>
    )
  }

  if (q.input_type === "confirmation") {
    return (
      <div className="flex gap-2">
        {["Yes", "No"].map((opt) => (
          <button
            key={opt}
            onClick={() => { onChange(opt); onAutoSubmit?.(opt) }}
            className="px-5 py-1.5 rounded-lg text-sm border bg-background border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {opt}
          </button>
        ))}
      </div>
    )
  }

  if (q.input_type === "single_choice") {
    return (
      <div className="space-y-1.5">
        {q.options.map((opt) => (
          <button
            key={opt}
            onClick={() => { onChange(opt); onAutoSubmit?.(opt) }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm border bg-background border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
          >
            {opt}
          </button>
        ))}
      </div>
    )
  }

  if (q.input_type === "multi_choice") {
    const toggle = (opt: string) => {
      const next = new Set(selectedMulti)
      if (next.has(opt)) next.delete(opt); else next.add(opt)
      setSelectedMulti(next)
      onChange(Array.from(next).join(", "))
    }
    return (
      <div className="space-y-1.5">
        {q.options.map((opt) => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
              selectedMulti.has(opt)
                ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 border-transparent"
                : "bg-background border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {opt}
          </button>
        ))}
        {selectedMulti.size > 0 && (
          <Button size="sm" variant="outline" className="mt-1" onClick={onNext}>
            {isLast ? "Submit" : `Next (${selectedMulti.size} selected)`}
          </Button>
        )}
      </div>
    )
  }

  return null
}

// ── Paginated mode ────────────────────────────────────────────────────────────

function PaginatedForm({ block, onSubmit }: ChatFormWidgetProps) {
  const [page, setPage] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => Object.fromEntries(block.questions.map((q) => [q.name, ""]))
  )
  const [transitioning, setTransitioning] = useState(false)

  const q = block.questions[page]
  const isLast = page === block.questions.length - 1

  const advance = (overrideAnswers?: Record<string, string>) => {
    const final = overrideAnswers ?? answers
    if (isLast) {
      onSubmit(block.requestId, JSON.stringify(final))
    } else {
      setTransitioning(true)
      setTimeout(() => { setPage((p) => p + 1); setTransitioning(false) }, 120)
    }
  }

  const handleAutoSubmit = (val: string) => {
    const updated = { ...answers, [q.name]: val }
    setAnswers(updated)
    advance(updated)
  }

  const handleNext = () => {
    if (!answers[q.name]?.trim()) return
    advance()
  }

  return (
    <div className={`bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl px-4 py-4 space-y-3 transition-opacity duration-100 ${transitioning ? "opacity-0" : "opacity-100"}`}>
      {/* Progress dots */}
      {block.questions.length > 1 && (
        <div className="flex gap-1.5">
          {block.questions.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i < page
                  ? "w-4 bg-zinc-400 dark:bg-zinc-500"
                  : i === page
                  ? "w-4 bg-zinc-800 dark:bg-zinc-200"
                  : "w-1.5 bg-zinc-200 dark:bg-zinc-700"
              }`}
            />
          ))}
        </div>
      )}

      <p className="text-sm font-medium text-foreground">{q.question}</p>

      <QuestionInput
        q={q}
        value={answers[q.name] ?? ""}
        onChange={(v) => setAnswers((prev) => ({ ...prev, [q.name]: v }))}
        onAutoSubmit={AUTO_ADVANCE_TYPES.has(q.input_type) ? handleAutoSubmit : undefined}
        isLast={isLast}
        onNext={handleNext}
      />
    </div>
  )
}

// ── All-on-one-page mode ──────────────────────────────────────────────────────

function AllInOneForm({ block, onSubmit }: ChatFormWidgetProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => Object.fromEntries(block.questions.map((q) => [q.name, ""]))
  )

  const isComplete = block.questions.every((q) => (answers[q.name] ?? "").trim().length > 0)

  const handleSubmit = () => {
    if (!isComplete) return
    onSubmit(block.requestId, JSON.stringify(answers))
  }

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl px-4 py-4 space-y-4">
      {block.questions.map((q) => (
        <div key={q.name} className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{q.question}</p>
          <QuestionInput
            q={q}
            value={answers[q.name] ?? ""}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [q.name]: v }))}
            isLast={true}
            onNext={handleSubmit}
          />
        </div>
      ))}
      <Button size="sm" onClick={handleSubmit} disabled={!isComplete} className="w-full">
        <Send className="size-3.5 mr-1.5" />
        Submit
      </Button>
    </div>
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function ChatFormWidget({ block, onSubmit }: ChatFormWidgetProps) {
  if (block.answered) return <AnsweredView block={block} />
  if (block.paginated) return <PaginatedForm block={block} onSubmit={onSubmit} />
  return <AllInOneForm block={block} onSubmit={onSubmit} />
}
