"use client"
import { ReactNode } from "react"
import { RefreshCw, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DirectoryCopyButton } from "@/components/shared/DirectoryCopyButton"
import { cn } from "@/lib/utils"

interface SidebarPanelProps {
  title: string
  path?: string
  onRefresh?: () => void
  onCreate?: () => void
  createDisabled?: boolean
  createTooltip?: string
  createButton?: ReactNode
  filter?: ReactNode
  children: ReactNode
}

export function SidebarPanel({
  title,
  path,
  onRefresh,
  onCreate,
  createDisabled,
  createTooltip,
  createButton,
  filter,
  children,
}: SidebarPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-0.5 px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-sm flex-1 truncate">{title}</span>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRefresh}
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          {createButton ?? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onCreate}
              disabled={createDisabled}
              title={createTooltip || "Create new"}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {path && <DirectoryCopyButton path={path} />}
      </div>

      {/* Optional filter bar */}
      {filter && (
        <div className="flex-shrink-0 border-b border-border">
          {filter}
        </div>
      )}

      {/* Item list */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
