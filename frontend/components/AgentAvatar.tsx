"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { agentInitials } from "@/lib/utils"

interface AgentAvatarProps {
  agentId: string
  color?: string
  className?: string
  fallbackClassName?: string
}

export function AgentAvatar({ agentId, color, className, fallbackClassName }: AgentAvatarProps) {
  return (
    <Avatar className={className}>
      <AvatarFallback
        style={color ? { backgroundColor: color } : undefined}
        className={fallbackClassName ?? "text-white text-xs font-bold"}
      >
        {agentInitials(agentId)}
      </AvatarFallback>
    </Avatar>
  )
}
