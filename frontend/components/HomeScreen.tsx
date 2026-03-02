"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { SendHorizonalIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toastError } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { AgentConfig } from "@/lib/api"
import { AgentPickerButton } from "@/components/AgentPickerButton"
import { useDefaultAgent } from "@/hooks/use-default-agent"

const CHIPS: { label: string; prompt: string }[] = [
  { label: "Python", prompt: "Write a Python script that " },
  { label: "Explain", prompt: "Explain how this works:\n\n" },
  { label: "Review", prompt: "Review and improve this code:\n\n" },
  { label: "Research", prompt: "Research and summarize " },
  { label: "Debug", prompt: "Help me debug this error:\n\n" },
]

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

export function HomeScreen() {
  const router = useRouter()
  const [text, setText] = useState("")
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const { agentId: selectedAgentId, setDefault: setSelectedAgentId } = useDefaultAgent(agents)
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {})
  }, [])

  useEffect(() => {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || loading || !selectedAgentId) return
    setLoading(true)
    try {
      const session = await api.createSession({ agent_id: selectedAgentId })
      sessionStorage.setItem(`init:${session.id}`, trimmed)
      router.push(`/chats?id=${session.id}`)
    } catch {
      toastError("Failed to start chat")
      setLoading(false)
    }
  }, [text, loading, selectedAgentId, router])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleChipClick = useCallback((prompt: string) => {
    setText(prompt)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }
    })
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            {getGreeting()}
          </h1>
          <p className="text-muted-foreground text-sm">
            Start a conversation or pick a suggestion below.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-lg ring-1 ring-black/5 dark:ring-white/5 transition-shadow focus-within:shadow-xl focus-within:ring-primary/20">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="How can I help you today?"
            rows={3}
            className="w-full resize-none rounded-t-2xl bg-transparent px-5 pt-5 pb-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none leading-relaxed"
          />
          <div className="flex items-center justify-between px-4 pb-4 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {CHIPS.map(({ label, prompt }) => (
                <button
                  key={label}
                  onClick={() => handleChipClick(prompt)}
                  className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 hover:border-border transition-all"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              {agents.length > 0 && (
                <AgentPickerButton
                  agents={agents}
                  agentId={selectedAgentId}
                  onSelect={setSelectedAgentId}
                />
              )}
              <Button
                size="sm"
                className="gap-1.5 rounded-xl px-4"
                onClick={handleSubmit}
                disabled={!text.trim() || loading || !selectedAgentId}
              >
                <SendHorizonalIcon className="size-3.5" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
