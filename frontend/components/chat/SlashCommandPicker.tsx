"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export interface CommandItem {
  kind: "command" | "skill"
  id: string
  label: string
  description: string
}

interface SlashCommandPickerProps {
  items: CommandItem[]
  selectedIndex: number
  onSelect: (item: CommandItem) => void
}

export function SlashCommandPicker({ items, selectedIndex, onSelect }: SlashCommandPickerProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (items.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute bottom-full mb-1.5 left-0 right-0 z-50 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
    >
      <div className="max-h-[260px] overflow-y-auto py-1">
        {items.map((item, i) => (
          <button
            key={item.kind + ":" + item.id}
            ref={i === selectedIndex ? selectedRef : undefined}
            onMouseDown={(e) => {
              e.preventDefault() // prevent textarea blur
              onSelect(item)
            }}
            className={cn(
              "w-full flex items-start gap-3 px-3 py-2 text-left transition-colors",
              i === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50 text-foreground"
            )}
          >
            <span
              className={cn(
                "shrink-0 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded",
                item.kind === "command"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {item.kind === "command" ? "CMD" : "SKILL"}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium leading-none mb-0.5">{item.label}</div>
              <div className="text-xs text-muted-foreground truncate">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
