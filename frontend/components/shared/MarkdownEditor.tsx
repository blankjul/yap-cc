"use client"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { RefreshCw, ExternalLink, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"

interface MarkdownEditorProps {
  value: string
  onChange?: (value: string) => void
  onSave?: (value: string) => void
  onReload?: () => void
  readOnly?: boolean
  placeholder?: string
  className?: string
  filePath?: string
  updatedAt?: number | null
}

function FilePathHeader({
  filePath,
  fileChanged,
  onReload,
  onOpen,
}: {
  filePath: string
  fileChanged: boolean
  onReload?: () => void
  onOpen: () => void
}) {
  // Shorten /Users/name/ or /home/name/ → ~/
  const displayPath = filePath.replace(/^\/(?:Users|home)\/[^/]+\//, "~/")

  return (
    <div className="flex-shrink-0 border-b border-border">
      {fileChanged && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs border-b border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">File changed on disk</span>
          {onReload && (
            <button
              onClick={onReload}
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              Reload
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-muted/30">
        <span
          className="flex-1 font-mono text-xs text-muted-foreground truncate"
          title={filePath}
        >
          {displayPath}
        </span>
        {onReload && (
          <button
            onClick={onReload}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Reload from disk"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onOpen}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Open in external editor"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  onReload,
  readOnly = false,
  placeholder,
  className,
  filePath,
  updatedAt,
}: MarkdownEditorProps) {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)
  const [fileChanged, setFileChanged] = useState(false)
  // Track the last-committed value for dirty comparison
  const savedValueRef = useRef(value)
  // Prevent useEffect from resetting state when our own onChange caused the value update
  const isInternalChange = useRef(false)
  // Always-current updatedAt without restarting the poll interval
  const updatedAtRef = useRef(updatedAt)

  useEffect(() => {
    updatedAtRef.current = updatedAt
    // Parent acknowledged the latest file state (after save or reload) — clear banner
    setFileChanged(false)
  }, [updatedAt])

  useEffect(() => {
    setFileChanged(false)
  }, [filePath])

  // External value change (item switch, parent reload) — reset editor state
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false
      return
    }
    savedValueRef.current = value
    setDraft(value)
    setDirty(false)
  }, [value])

  // Auto-poll for external file changes every 5s
  useEffect(() => {
    if (!filePath) return
    const interval = setInterval(async () => {
      try {
        const { mtime } = await api.fileMtime(filePath)
        if (updatedAtRef.current != null && mtime > updatedAtRef.current + 1) {
          setFileChanged(true)
        }
      } catch { /* silently ignore network/404 errors */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [filePath])

  const handleChange = (v: string) => {
    isInternalChange.current = true
    setDraft(v)
    setDirty(v !== savedValueRef.current)
    onChange?.(v)
  }

  const handleSave = () => {
    savedValueRef.current = draft
    setDirty(false)
    setFileChanged(false)
    onSave?.(draft)
  }

  const handleReload = () => {
    setFileChanged(false)
    onReload?.()
  }

  const handleOpenFile = async () => {
    if (!filePath) return
    try { await api.fileOpen(filePath) } catch { /* ignore */ }
  }

  if (readOnly) {
    return (
      <div className={cn("flex flex-col", filePath && "border border-input rounded-md overflow-hidden", className)}>
        {filePath && (
          <FilePathHeader
            filePath={filePath}
            fileChanged={fileChanged}
            onReload={onReload ? handleReload : undefined}
            onOpen={handleOpenFile}
          />
        )}
        <div className="prose prose-sm dark:prose-invert max-w-none p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value || "_empty_"}</ReactMarkdown>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col", filePath && "border border-input rounded-md overflow-hidden", className)}>
      {onSave && (
        <div className="flex justify-end pb-2 flex-shrink-0">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty}
          >
            Save
          </Button>
        </div>
      )}
      {filePath && (
        <FilePathHeader
          filePath={filePath}
          fileChanged={fileChanged}
          onReload={onReload ? handleReload : undefined}
          onOpen={handleOpenFile}
        />
      )}
      <Textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder || "Write markdown here..."}
        className={cn(
          "flex-1 resize-none font-mono text-sm min-h-[100px]",
          filePath && "border-0 rounded-none shadow-none focus-visible:ring-0"
        )}
      />
    </div>
  )
}
