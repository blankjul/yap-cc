import { useState, useCallback } from "react"
import type { AgentConfig } from "@/lib/api"

const LAST_AGENT_KEY = "home-last-agent"

export function useDefaultAgent(agents: AgentConfig[]) {
  const resolve = (list: AgentConfig[]): string => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(LAST_AGENT_KEY) : null
    return list.find((a) => a.id === stored)?.id ?? list[0]?.id ?? ""
  }

  const [agentId, setAgentId] = useState<string>(() => resolve(agents))

  // Re-resolve when agents list changes (e.g. after async load)
  // We use a ref-based pattern to avoid infinite loops while still syncing
  const [prevAgents, setPrevAgents] = useState(agents)
  if (agents !== prevAgents) {
    setPrevAgents(agents)
    const resolved = resolve(agents)
    if (resolved !== agentId) {
      setAgentId(resolved)
    }
  }

  const agent = agents.find((a) => a.id === agentId) ?? null

  const setDefault = useCallback((id: string) => {
    setAgentId(id)
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_AGENT_KEY, id)
    }
  }, [])

  return { agentId, agent, setDefault }
}
