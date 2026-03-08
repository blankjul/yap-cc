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
          active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {shortcut && (
          <span className={cn("text-[10px] font-mono", active ? "text-primary-foreground/50" : "text-muted-foreground/50")}>
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
            active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
          )}
        >
          <Icon className="w-5 h-5" />
          {shortcut && (
            <span className={cn("text-[9px] leading-none mt-0.5", active ? "opacity-60" : "opacity-50")}>{shortcut}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
