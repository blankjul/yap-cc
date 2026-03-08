"use client"

import { useState, useEffect } from "react"
import { useBrowserStatus } from "@/hooks/use-browser-status"
import { Monitor, AlertCircle, Loader2, Play, Info } from "lucide-react"
import { api } from "@/lib/api"

export default function BrowserPage() {
  const { status, isLoading, error, vncUrl } = useBrowserStatus()
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [showHotkeyHint, setShowHotkeyHint] = useState(true)

  // Detect when iframe gets focus and show hint
  useEffect(() => {
    const handleFocus = () => setShowHotkeyHint(true)
    window.addEventListener("blur", handleFocus)
    return () => window.removeEventListener("blur", handleFocus)
  }, [])

  // Press Escape to release focus from iframe + click outside to blur
  useEffect(() => {
    const blurIframe = () => {
      const iframe = document.querySelector("iframe") as HTMLElement
      iframe?.blur()
      document.body.focus()
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        blurIframe()
      }
    }

    // Click on header or hint to blur iframe
    const handleHeaderClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("iframe")) {
        blurIframe()
      }
    }

    // Use capture phase to intercept Escape before iframe
    window.addEventListener("keydown", handleEscape, true)
    document.addEventListener("click", handleHeaderClick)

    return () => {
      window.removeEventListener("keydown", handleEscape, true)
      document.removeEventListener("click", handleHeaderClick)
    }
  }, [])

  const handleStartBrowser = async () => {
    setIsStarting(true)
    setStartError(null)
    try {
      console.log("Starting browser...")
      // Navigate to a blank page to start the browser and VNC
      const res = await fetch("/api/browser/navigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "about:blank", max_chars: 100 }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Failed to start browser: ${errorText}`)
      }

      console.log("Browser started successfully")
    } catch (err) {
      console.error("Failed to start browser:", err)
      setStartError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStarting(false)
    }
  }

  if (isLoading || isStarting) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>{isStarting ? "Starting browser..." : "Connecting to browser..."}</p>
          <p className="text-xs text-muted-foreground/70">This may take a few moments</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p>Error connecting to browser: {error}</p>
        </div>
      </div>
    )
  }

  if (!status?.vnc_active || !vncUrl) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground max-w-md">
          <Monitor className="h-12 w-12" />
          <p className="text-lg font-medium">Browser Viewer</p>
          <p className="text-sm text-center">
            The browser is not running yet. Start it to view and interact with web pages.
          </p>
          <button
            onClick={handleStartBrowser}
            disabled={isStarting}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting Browser...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Browser
              </>
            )}
          </button>
          {startError && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive max-w-full">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="break-words">{startError}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground/70">
            Or ask an agent to navigate to a page
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          <h1 className="text-sm font-medium">Browser Viewer</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button
            onClick={() => {
              const iframe = document.querySelector("iframe") as HTMLElement
              iframe?.blur()
              document.body.focus()
              document.body.click()
            }}
            className="px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs font-medium transition-colors"
            title="Click here to use keyboard shortcuts"
          >
            Enable Hotkeys
          </button>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span>Connected</span>
          </div>
          {status.current_url && (
            <span className="max-w-md truncate" title={status.current_url}>
              {status.current_url}
            </span>
          )}
        </div>
      </div>

      {/* Hotkey hint */}
      {showHotkeyHint && (
        <div className="flex items-center gap-2 bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground border-b cursor-pointer hover:bg-muted/70">
          <Info className="h-3 w-3" />
          <span>
            Keyboard shortcuts don't work while the browser has focus. Press <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px] font-mono">Esc</kbd> or click anywhere outside the browser to use hotkeys.
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowHotkeyHint(false)
            }}
            className="ml-auto text-muted-foreground/70 hover:text-foreground"
          >
            ×
          </button>
        </div>
      )}

      {/* VNC Viewer */}
      <div className="flex-1 overflow-hidden">
        <iframe
          src={vncUrl}
          className="h-full w-full border-0"
          title="Browser VNC Viewer"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  )
}
