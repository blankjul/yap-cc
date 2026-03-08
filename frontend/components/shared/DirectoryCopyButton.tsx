"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

interface DirectoryCopyButtonProps {
  path: string
  className?: string
}

export function DirectoryCopyButton({ path, className }: DirectoryCopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors group w-fit",
        className
      )}
    >
      <code className="font-mono text-[11px] bg-muted px-1 rounded">{path}</code>
      {copied ? (
        <Check className="size-3 text-emerald-500 shrink-0" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
}
