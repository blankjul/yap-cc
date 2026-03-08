"use client"

import { ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { EnvironmentConfig } from "@/lib/api"

interface EnvironmentPickerButtonProps {
  environments: EnvironmentConfig[]
  environmentId: string
  onSelect: (id: string) => void
}

function shortModelLabel(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes("haiku")) return "Haiku"
  if (lower.includes("sonnet")) return "Sonnet"
  if (lower.includes("opus")) return "Opus"
  return model.split("/").pop() ?? model
}

export function EnvironmentPickerButton({ environments, environmentId, onSelect }: EnvironmentPickerButtonProps) {
  const current = environments.find((e) => e.id === environmentId)
  const label = current
    ? `${current.name} · ${shortModelLabel(current.model)}`
    : "Environment"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
          <span className="max-w-[120px] truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        {environments.map((env) => (
          <DropdownMenuItem
            key={env.id}
            onClick={() => onSelect(env.id)}
            className="flex items-center gap-2"
          >
            <span>{env.name}</span>
            <span className="ml-1 text-[10px] text-muted-foreground">{env.model}</span>
            {env.id === environmentId && (
              <span className="ml-auto text-[10px] text-muted-foreground">default</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
