"use client"

import { useState } from "react"
import { ChevronDownIcon, FileTextIcon } from "lucide-react"
import { CopyButton } from "@/components/CopyButton"

interface SystemPromptBubbleProps {
  content: string
}

export function SystemPromptBubble({ content }: SystemPromptBubbleProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-700/60 dark:bg-yellow-950/30 text-xs font-mono mb-2">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-yellow-100/60 dark:hover:bg-yellow-900/30 rounded-lg transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <FileTextIcon className="size-3 text-yellow-600 dark:text-yellow-500 shrink-0" />
        <span className="font-medium tracking-tight text-yellow-800 dark:text-yellow-300">
          system prompt
        </span>
        <span className="text-[10px] text-yellow-600 dark:text-yellow-500 ml-0.5">
          {content.length} chars
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span onClick={(e) => e.stopPropagation()}>
            <CopyButton
              value={content}
              className="text-yellow-600 dark:text-yellow-500 hover:text-yellow-800 dark:hover:text-yellow-300"
              iconClass="size-3"
            />
          </span>
          <ChevronDownIcon
            className={`size-3 text-yellow-600 dark:text-yellow-500 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>
      {expanded && (
        <div className="border-t border-yellow-200 dark:border-yellow-700/40 px-3 pb-3 pt-2">
          <pre className="text-[11px] text-yellow-900 dark:text-yellow-200 whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}
