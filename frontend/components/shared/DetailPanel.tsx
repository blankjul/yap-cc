"use client"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface DetailPanelProps {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function DetailPanel({ title, subtitle, actions, children, className }: DetailPanelProps) {
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            {title && <h2 className="font-semibold text-base">{title}</h2>}
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
