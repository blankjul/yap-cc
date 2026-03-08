"use client"

import { useState } from "react"

interface ContextDividerBarProps {
  kind: "new" | "compact"
  summary?: string
}

export function ContextDividerBar({ kind, summary }: ContextDividerBarProps) {
  const [expanded, setExpanded] = useState(false)

  const label = kind === "new" ? "Context reset" : "Context compacted"

  return (
    <div className="flex flex-col items-center py-4 gap-1.5 select-none">
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground shrink-0 font-medium">{label}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      {kind === "compact" && summary && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "Hide summary" : "Show summary"}
        </button>
      )}
      {expanded && summary && (
        <p className="text-xs text-muted-foreground italic max-w-2xl text-center px-4">{summary}</p>
      )}
    </div>
  )
}
