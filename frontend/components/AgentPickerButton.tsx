"use client"

import { ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { AgentConfig } from "@/lib/api"

interface AgentPickerButtonProps {
  agents: AgentConfig[]
  agentId: string
  onSelect: (id: string) => void
}

export function AgentPickerButton({ agents, agentId, onSelect }: AgentPickerButtonProps) {
  const current = agents.find((a) => a.id === agentId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
          {current?.color && (
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: current.color }}
            />
          )}
          <span className="max-w-[80px] truncate">{current?.name ?? "Agent"}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        {agents.map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            onClick={() => onSelect(agent.id)}
            className="flex items-center gap-2"
          >
            {agent.color && (
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: agent.color }}
              />
            )}
            <span>{agent.name}</span>
            {agent.id === agentId && (
              <span className="ml-auto text-[10px] text-muted-foreground">default</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
