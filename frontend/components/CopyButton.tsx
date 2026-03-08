"use client"

import { useState } from "react"
import { CopyIcon, CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface CopyButtonProps {
  value?: string
  getText?: () => string
  className?: string
  iconClass?: string
  duration?: number
  title?: string
}

export function CopyButton({
  value,
  getText,
  className,
  iconClass = "size-3.5",
  duration = 1500,
  title = "Copy to clipboard",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text = getText ? getText() : (value ?? "")
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), duration)
      })
    } else {
      const el = document.createElement("textarea")
      el.value = text
      el.style.position = "fixed"
      el.style.opacity = "0"
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), duration)
    }
  }

  return (
    <button
      onClick={handleCopy}
      title={title}
      className={cn("transition-opacity p-1 rounded", className)}
    >
      {copied ? (
        <CheckIcon className={cn(iconClass, "text-green-500")} />
      ) : (
        <CopyIcon className={iconClass} />
      )}
    </button>
  )
}
