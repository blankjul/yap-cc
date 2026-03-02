"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { Bot } from "lucide-react"
import { api, AgentConfig } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout"
import { SidebarPanel } from "@/components/shared/SidebarPanel"
import { ItemList } from "@/components/shared/ItemList"
import { MarkdownEditor } from "@/components/shared/MarkdownEditor"
import { EmptyState } from "@/components/shared/EmptyState"
import { DetailPanel } from "@/components/shared/DetailPanel"
import { AgentAvatar } from "@/components/AgentAvatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const MODELS: Record<"claude-cli" | "openrouter", { value: string; label: string; description: string }[]> = {
  "claude-cli": [
    { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5", description: "Fast & efficient" },
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Balanced" },
    { value: "claude-opus-4-6", label: "Opus 4.6", description: "Most capable" },
  ],
  "openrouter": [
    { value: "anthropic/claude-haiku-4-5-20251001", label: "Haiku 4.5", description: "Fast & efficient" },
    { value: "anthropic/claude-sonnet-4-6", label: "Sonnet 4.6", description: "Balanced" },
    { value: "anthropic/claude-opus-4-6", label: "Opus 4.6", description: "Most capable" },
  ],
}

function ProviderBadge({ provider }: { provider: "claude-cli" | "openrouter" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 py-0 h-4 font-mono",
        provider === "claude-cli" ? "border-amber-500/50 text-amber-500" : "border-sky-500/50 text-sky-500"
      )}
    >
      {provider === "claude-cli" ? "claude" : "openrouter"}
    </Badge>
  )
}

function AgentsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get("id")

  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [selected, setSelected] = useState<AgentConfig | null>(null)
  const [draft, setDraft] = useState<AgentConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Create flow state
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const newInputRef = useRef<HTMLInputElement>(null)

  // Rename-inline state
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const renameRef = useRef<HTMLInputElement>(null)

  const setSelectedId = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("id", id)
    router.push(`/agents?${params.toString()}`, { scroll: false })
  }

  const loadAgents = async () => {
    setLoading(true)
    try {
      const list = await api.listAgents()
      setAgents(list)
      // Auto-select first
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to load agents")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAgents() }, [])

  // Load detail when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      setDraft(null)
      return
    }
    const found = agents.find((a) => a.id === selectedId) ?? null
    if (found) {
      setSelected(found)
      setDraft({ ...found })
    } else if (agents.length > 0) {
      // fetch individually if not in list yet
      api.getAgent(selectedId)
        .then((a) => { setSelected(a); setDraft({ ...a }) })
        .catch(() => {})
    }
  }, [selectedId, agents])

  const startCreating = () => {
    setCreating(true)
    setNewName("")
    setTimeout(() => newInputRef.current?.focus(), 0)
  }

  const commitCreate = async () => {
    const name = newName.trim()
    setCreating(false)
    setNewName("")
    if (!name) return
    try {
      const created = await api.createAgent({
        name,
        provider_id: "claude-cli",
        model: "claude-haiku-4-5-20251001",
        system_prompt: "You are a helpful assistant.",
        color: "#6366f1",
      })
      await loadAgents()
      setSelectedId(created.id)
      toast.success(`Agent "${name}" created`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create agent")
    }
  }

  const handleSave = async () => {
    if (!draft || !selected) return
    setSaving(true)
    try {
      const updated = await api.updateAgent(selected.id, draft)
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      setSelected(updated)
      setDraft({ ...updated })
      toast.success("Saved")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteAgent(id)
      const remaining = agents.filter((a) => a.id !== id)
      setAgents(remaining)
      if (selectedId === id) {
        if (remaining.length > 0) {
          setSelectedId(remaining[0].id)
        } else {
          router.push("/agents", { scroll: false })
        }
      }
      toast.success("Agent deleted")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete agent")
    }
  }

  const startRename = (agent: AgentConfig) => {
    setRenaming(agent.id)
    setRenameValue(agent.name)
    setTimeout(() => renameRef.current?.focus(), 0)
  }

  const commitRename = async (id: string) => {
    const name = renameValue.trim()
    setRenaming(null)
    if (!name) return
    const agent = agents.find((a) => a.id === id)
    if (!agent || name === agent.name) return
    try {
      const updated = await api.updateAgent(id, { name })
      setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)))
      if (selectedId === id) {
        setSelected(updated)
        setDraft({ ...updated })
      }
      toast.success("Renamed")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to rename")
    }
  }

  const handleStartChat = async () => {
    if (!selected) return
    try {
      const session = await api.createSession({ agent_id: selected.id })
      router.push(`/chats?id=${session.id}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create session")
    }
  }

  const items = agents.map((agent) => {
    const modelShort = agent.model
      .replace(/^anthropic\//, "")
      .replace(/^claude-/, "")
      .replace(/-\d{8,}$/, "")   // strip date suffixes like -20251001
    const providerShort = agent.provider_id === "claude-cli" ? "claude" : "openrouter"
    return {
    id: agent.id,
    label: agent.name,
    sublabel: `${providerShort} · ${modelShort}`,
    icon: (
      <AgentAvatar agentId={agent.id} color={agent.color} className="h-6 w-6 flex-shrink-0" />
    ),
    badge: <ProviderBadge provider={agent.provider_id} />,
    actions: [
      {
        label: "Rename",
        onClick: () => startRename(agent),
      },
      ...(agent.builtin
        ? []
        : [
            {
              label: "Delete",
              onClick: () => handleDelete(agent.id),
              variant: "destructive" as const,
            },
          ]),
    ],
  }
  })

  const isDirty =
    draft &&
    selected &&
    (draft.name !== selected.name ||
      draft.provider_id !== selected.provider_id ||
      draft.model !== selected.model ||
      draft.system_prompt !== selected.system_prompt ||
      draft.color !== selected.color)

  const sidebar = (
    <SidebarPanel
      title="Agents"
      path="~/.yapflows/agents/"
      onRefresh={loadAgents}
      onCreate={startCreating}
    >
      {loading ? (
        <div className="space-y-1 p-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : (
        <>
          {creating && (
            <div className="px-2 pt-2">
              <Input
                ref={newInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={commitCreate}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitCreate()
                  if (e.key === "Escape") { setCreating(false); setNewName("") }
                }}
                placeholder="agent-name"
                className="h-8 text-sm font-mono"
              />
            </div>
          )}
          {renaming && (
            <div className="px-2 pt-2">
              <Input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(renaming)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(renaming)
                  if (e.key === "Escape") setRenaming(null)
                }}
                className="h-8 text-sm"
              />
            </div>
          )}
          <ItemList
            items={items}
            selectedId={selectedId ?? undefined}
            onSelect={setSelectedId}
            emptyMessage="No agents yet."
          />
        </>
      )}
    </SidebarPanel>
  )

  const main =
    !selected || !draft ? (
      <EmptyState
        icon={<Bot className="w-10 h-10" />}
        title="No agent selected"
        description="Select an agent from the list or create a new one."
      />
    ) : (
      <DetailPanel
        title={
          <div className="flex items-center gap-2">
            <AgentAvatar agentId={selected.id} color={draft.color} className="h-7 w-7" />
            <span>{draft.name}</span>
            <ProviderBadge provider={draft.provider_id} />
            {draft.builtin && (
              <Badge variant="secondary" className="text-[10px] h-4">built-in</Badge>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartChat}
            >
              Start chat
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="p-6 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Name</Label>
            {draft.builtin ? (
              <p className="text-sm text-muted-foreground">{draft.name}</p>
            ) : (
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="max-w-sm"
              />
            )}
          </div>

          {/* Provider */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Provider</Label>
            <Select
              value={draft.provider_id}
              onValueChange={(v: "claude-cli" | "openrouter") => {
                const defaultModel = MODELS[v][0].value
                setDraft({ ...draft, provider_id: v, model: defaultModel })
              }}
            >
              <SelectTrigger className="max-w-sm text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-cli">Claude CLI</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          {(() => {
            const presets = MODELS[draft.provider_id] ?? []
            const isPreset = presets.some((m) => m.value === draft.model)
            return (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Model</Label>
                <div className="space-y-2 max-w-sm">
                  <Select
                    value={isPreset ? draft.model : "__custom__"}
                    onValueChange={(v) => {
                      if (v !== "__custom__") setDraft({ ...draft, model: v })
                      else setDraft({ ...draft, model: "" })
                    }}
                  >
                    <SelectTrigger className="font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="font-mono text-sm">
                          <span>{m.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{m.description}</span>
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__" className="text-sm">Custom…</SelectItem>
                    </SelectContent>
                  </Select>
                  {!isPreset && (
                    <Input
                      value={draft.model}
                      onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                      className="font-mono text-sm"
                      placeholder="e.g. anthropic/claude-haiku-4-5-20251001"
                      autoFocus
                    />
                  )}
                </div>
              </div>
            )
          })()}


          {/* Color */}
          {!draft.builtin && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                  className="h-8 w-16 cursor-pointer rounded border border-input bg-background p-0.5"
                />
                <span className="text-sm font-mono text-muted-foreground">{draft.color}</span>
              </div>
            </div>
          )}

          {/* System Prompt */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">System Prompt</Label>
            <MarkdownEditor
              value={draft.system_prompt}
              onChange={(v) => setDraft({ ...draft, system_prompt: v })}
              onReload={() => {
                if (!selectedId) return
                api.getAgent(selectedId).then((a) => { setSelected(a); setDraft({ ...a }) }).catch(() => {})
              }}
              readOnly={draft.builtin}
              placeholder="Enter system prompt..."
              filePath={draft.file_path ?? undefined}
              updatedAt={draft.updated_at ?? undefined}
              className="min-h-[260px]"
            />
          </div>
        </div>
      </DetailPanel>
    )

  return (
    <TwoPaneLayout
      sidebar={sidebar}
      main={main}
      defaultSidebarWidth={260}
    />
  )
}

export function AgentsTab() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground text-sm">Loading...</div>}>
      <AgentsContent />
    </Suspense>
  )
}
