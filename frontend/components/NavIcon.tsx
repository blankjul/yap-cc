"use client"

import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface NavIconProps {
  icon: LucideIcon
  label: string
  shortcut?: string
  active?: boolean
  wide?: boolean
  leaderKey?: string
  onClick?: () => void
}

export function NavIcon({
  icon: Icon,
  label,
  shortcut,
  active,
  wide,
  leaderKey = "\\",
  onClick,
}: NavIconProps) {
  if (wide) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-accent",
          active && "text-foreground bg-accent"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {shortcut && (
          <span className="text-[10px] text-muted-foreground/50 font-mono">
            {leaderKey}{shortcut}
          </span>
        )}
      </button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-accent",
            active && "text-foreground bg-accent"
          )}
        >
          <Icon className="w-5 h-5" />
          {shortcut && (
            <span className="text-[9px] opacity-50 leading-none mt-0.5">{shortcut}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
