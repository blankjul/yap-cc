"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ShortcutRow {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: ShortcutRow[]
}

interface HotkeysTabProps {
  open: boolean
  onClose: () => void
  leaderKey?: string
}

export function HotkeysTab({ open, onClose, leaderKey = "\\" }: HotkeysTabProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  // Trap focus and prevent scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [open])

  if (!open) return null

  const lk = leaderKey

  const groups: ShortcutGroup[] = [
    {
      title: "Navigation",
      shortcuts: [
        { keys: [lk, "1"], description: "Home" },
        { keys: [lk, "2"], description: "Chats" },
        { keys: [lk, "3"], description: "Agents" },
        { keys: [lk, "4"], description: "Knowledge" },
        { keys: [lk, "5"], description: "Memory" },
        { keys: [lk, "6"], description: "Tasks" },
        { keys: [lk, "7"], description: "Skills" },
        { keys: [lk, "8"], description: "Settings" },
      ],
    },
    {
      title: "Interface",
      shortcuts: [
        { keys: [lk, "t"], description: "Toggle sidebar" },
        { keys: [lk, "k"], description: "Open keyboard shortcuts" },
      ],
    },
    {
      title: "Sidebar Navigation",
      shortcuts: [
        { keys: ["`", "j / ↓"], description: "Next item (wraps)" },
        { keys: ["`", "k / ↑"], description: "Previous item (wraps)" },
      ],
    },
    {
      title: "Chat",
      shortcuts: [
        { keys: ["Enter"], description: "Send message" },
        { keys: ["Shift", "Enter"], description: "New line" },
        { keys: ["Escape"], description: "Close dialog / cancel" },
      ],
    },
  ]

  return (
    /* Backdrop */
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      {/* Modal panel */}
      <div
        className={cn(
          "relative bg-background border border-border rounded-xl shadow-xl",
          "w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background">
          <div>
            <h2 className="text-base font-semibold">Keyboard Shortcuts</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Leader keys:{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-xs">
                {lk}
              </kbd>
              {" "}navigation,{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-xs">
                `
              </kbd>
              {" "}list nav
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Shortcut groups */}
        <div className="px-6 py-4 space-y-6">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {group.title}
              </h3>
              <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                {group.shortcuts.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div className="flex items-center gap-1">
                      {s.keys.map((key, ki) => (
                        <span key={ki} className="flex items-center gap-1">
                          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-xs whitespace-nowrap">
                            {key}
                          </kbd>
                          {ki < s.keys.length - 1 && (
                            <span className="text-xs text-muted-foreground">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground ml-4 text-right">
                      {s.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
