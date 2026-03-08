"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle, XCircle, Loader2, Plus, X, Trash2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { api } from "@/lib/api"
import type { EnvironmentConfig, AgentConfig, TelegramChatConfig } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

// ── Form field wrapper ─────────────────────────────────────────────────────────

function FormRow({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-start gap-4 py-4 border-b border-border last:border-0">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}

// ── Test connection state ──────────────────────────────────────────────────────

type TestState = "idle" | "testing" | "ok" | "error"

// ── GeneralSettings ────────────────────────────────────────────────────────────

export function GeneralSettings() {
  const router = useRouter()

  // OpenRouter API key
  const [apiKey, setApiKey] = useState("")
  const [testState, setTestState] = useState<TestState>("idle")
  const [testError, setTestError] = useState<string | null>(null)

  // Leader keys
  const [leaderKey, setLeaderKey] = useState("\\")
  const [leaderKey2, setLeaderKey2] = useState("")

  // Log level
  const [logLevel, setLogLevel] = useState("info")

  // Telegram
  const [tgBotToken, setTgBotToken] = useState("")
  const [tgChats, setTgChats] = useState<TelegramChatConfig[]>([])

  // Dropdowns for agent/environment assignment
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([])

  // Saving state
  const [saving, setSaving] = useState(false)

  // Load settings + agents + environments on mount
  useEffect(() => {
    api.getSettings().catch(() => ({ telegram: undefined, ui: undefined })).then((settings) => {
      if (settings.telegram) {
        setTgBotToken(settings.telegram.bot_token ?? "")
        setTgChats(settings.telegram.chats ?? [])
      }
      if (settings.ui) {
        setLeaderKey(settings.ui.leader_key ?? "\\")
        setLeaderKey2(settings.ui.leader_key_2 ?? "")
      }
    })
    api.listAgents().then(setAgents).catch(() => {})
    api.listEnvironments().then(setEnvironments).catch(() => {})
  }, [])

  const handleTestProvider = async () => {
    setTestState("testing")
    setTestError(null)
    try {
      const result = await api.testProvider({
        provider_id: "openrouter",
        api_key: apiKey || undefined,
      })
      setTestState(result.ok ? "ok" : "error")
      if (!result.ok) setTestError(result.error ?? "Connection failed")
    } catch (err) {
      setTestState("error")
      setTestError(err instanceof Error ? err.message : "Test failed")
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await Promise.all([
        api.completeSetup({
          openrouter_api_key: apiKey || undefined,
        }),
        api.patchSettings({
          telegram: { bot_token: tgBotToken, chats: tgChats },
          ui: { leader_key: leaderKey, leader_key_2: leaderKey2 },
        }),
      ])
      toast.success("Settings saved")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const addTgChat = () => setTgChats((prev) => [...prev, { name: "", chat_id: "", agent_id: null, environment_id: null }])
  const removeTgChat = (i: number) => setTgChats((prev) => prev.filter((_, idx) => idx !== i))
  const updateTgChat = (i: number, field: keyof TelegramChatConfig, value: string | null) =>
    setTgChats((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">General</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure your Yapflows instance.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className={cn("text-muted-foreground")}
              onClick={() => router.push("/setup")}
            >
              Re-run setup wizard →
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </div>

        {/* Provider section */}
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Providers
          </h2>
          <div className="border border-border rounded-lg px-4">
            <FormRow
              label="OpenRouter API Key"
              description="Required for openrouter provider."
            >
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setTestState("idle") }}
                    placeholder="sk-or-..."
                    className="font-mono text-xs flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestProvider}
                    disabled={testState === "testing"}
                    className="shrink-0"
                  >
                    {testState === "testing" ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Testing...</>
                    ) : "Test"}
                  </Button>
                </div>

                {testState === "ok" && (
                  <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    Connection successful
                  </div>
                )}
                {testState === "error" && (
                  <div className="flex items-start gap-1.5 text-sm text-destructive">
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{testError || "Connection failed"}</span>
                  </div>
                )}
              </div>
            </FormRow>
          </div>
        </section>

        {/* Interface section */}
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Interface
          </h2>
          <div className="border border-border rounded-lg px-4">
            <FormRow
              label="Leader Key"
              description="Primary character used as the keyboard shortcut prefix."
            >
              <Input
                value={leaderKey}
                onChange={(e) => setLeaderKey(e.target.value.slice(-1) || leaderKey)}
                className="w-20 font-mono text-center"
                maxLength={1}
              />
            </FormRow>
            <FormRow
              label="Leader Key 2"
              description="Optional secondary leader key (leave blank to disable)."
            >
              <Input
                value={leaderKey2}
                onChange={(e) => setLeaderKey2(e.target.value.slice(-1))}
                className="w-20 font-mono text-center"
                maxLength={1}
                placeholder="—"
              />
            </FormRow>
          </div>
        </section>

        {/* Logging section */}
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Logging
          </h2>
          <div className="border border-border rounded-lg px-4">
            <FormRow
              label="Log Level"
              description="Controls the verbosity of server logs."
            >
              <select
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {["debug", "info", "warning", "error"].map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </FormRow>
          </div>
        </section>

        {/* Integrations section */}
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Integrations
          </h2>
          <div className="border border-border rounded-lg px-4">
            <FormRow
              label="Telegram bot token"
              description="Token from @BotFather. Changes take effect after server restart."
            >
              <Input
                type="password"
                value={tgBotToken}
                onChange={(e) => setTgBotToken(e.target.value)}
                placeholder="123456789:AAF..."
                className="font-mono text-xs"
              />
            </FormRow>
            <FormRow
              label="Telegram chats"
              description="Named chats that are allowed to interact. Only these chat IDs will be accepted."
            >
              <div className="space-y-3">
                {tgChats.map((chat, i) => (
                  <div key={i} className="space-y-1.5 border border-border rounded-md p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={chat.name}
                        onChange={(e) => updateTgChat(i, "name", e.target.value)}
                        placeholder="Name (e.g. Personal)"
                        className="text-xs flex-1"
                      />
                      <Input
                        value={chat.chat_id}
                        onChange={(e) => updateTgChat(i, "chat_id", e.target.value)}
                        placeholder="Chat ID"
                        className="font-mono text-xs w-36"
                      />
                      <button
                        onClick={() => removeTgChat(i)}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={chat.agent_id ?? ""}
                        onValueChange={(v) => updateTgChat(i, "agent_id", v || null)}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Agent (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={chat.environment_id ?? ""}
                        onValueChange={(v) => updateTgChat(i, "environment_id", v || null)}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Environment (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {environments.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addTgChat} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Add chat
                </Button>
              </div>
            </FormRow>
          </div>
        </section>

      </div>
    </div>
  )
}

// Keep SettingsTab as alias for backward compat with any other imports
export { GeneralSettings as SettingsTab }

// ── EnvironmentsSettings ───────────────────────────────────────────────────────

type EnvFormMode = "view" | "edit" | "new"

interface EnvFormState {
  id: string
  name: string
  provider_id: string
  model: string
}

export function EnvironmentsSettings() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedId = searchParams.get("id")

  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<EnvFormMode>("view")
  const [form, setForm] = useState<EnvFormState>({ id: "", name: "", provider_id: "claude-cli", model: "" })
  const [saving, setSaving] = useState(false)

  const loadEnvironments = useCallback(async () => {
    setLoading(true)
    try {
      const envs = await api.listEnvironments()
      setEnvironments(envs)
    } catch {
      toastError("Failed to load environments")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEnvironments()
  }, [loadEnvironments])

  // Auto-select first on load (but not when the "new" form is open)
  useEffect(() => {
    if (loading || selectedId || environments.length === 0 || mode === "new") return
    router.replace(`/settings?section=environments&id=${environments[0].id}`, { scroll: false })
  }, [environments, loading, selectedId, router, mode])

  const selectedEnv = environments.find((e) => e.id === selectedId) ?? null

  // When selection changes, reset form to view mode
  useEffect(() => {
    if (selectedEnv) {
      setForm({
        id: selectedEnv.id,
        name: selectedEnv.name,
        provider_id: selectedEnv.provider_id,
        model: selectedEnv.model,
      })
      setMode("view")
    }
  }, [selectedId])

  const handleSelect = (id: string) => {
    router.push(`/settings?section=environments&id=${id}`, { scroll: false })
  }

  const handleCreate = () => {
    setForm({ id: "", name: "", provider_id: "claude-cli", model: "claude-opus-4-5" })
    setMode("new")
    router.push(`/settings?section=environments`, { scroll: false })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (mode === "new") {
        if (!form.id.trim() || !form.name.trim() || !form.model.trim()) {
          toastError("All fields are required")
          return
        }
        const created = await api.createEnvironment({
          id: form.id.trim(),
          name: form.name.trim(),
          provider_id: form.provider_id,
          model: form.model.trim(),
        })
        await loadEnvironments()
        router.push(`/settings?section=environments&id=${created.id}`, { scroll: false })
        toast.success("Environment created")
      } else if (mode === "edit" && selectedEnv) {
        await api.updateEnvironment(selectedEnv.id, {
          name: form.name.trim(),
          provider_id: form.provider_id,
          model: form.model.trim(),
        })
        await loadEnvironments()
        setMode("view")
        toast.success("Environment saved")
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteEnvironment(id)
      await loadEnvironments()
      if (selectedId === id) {
        router.replace(`/settings?section=environments`, { scroll: false })
      }
      toast.success("Environment deleted")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete")
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-8 space-y-6">

        {/* Top selector bar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {environments.map((env) => (
            <button
              key={env.id}
              onClick={() => { setMode("view"); handleSelect(env.id) }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm transition-colors",
                mode !== "new" && selectedId === env.id
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              {env.name}
            </button>
          ))}
          <button
            onClick={handleCreate}
            className="px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="New environment"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={loadEnvironments}
            className="px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>

        {/* Detail / form area */}
        {mode === "new" ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold">New environment</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Create a named provider + model preset.</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">ID (slug)</Label>
                <Input
                  value={form.id}
                  onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                  placeholder="my-environment"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My Environment"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Provider</Label>
                <Select value={form.provider_id} onValueChange={(v) => setForm((f) => ({ ...f, provider_id: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-cli">claude-cli</SelectItem>
                    <SelectItem value="openrouter">openrouter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Model</Label>
                <Input
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="claude-opus-4-5"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Creating..." : "Create"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMode("view")
                  if (selectedId) handleSelect(selectedId)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : selectedEnv ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold">{selectedEnv.name}</h2>
                {selectedEnv.builtin && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">
                    built-in
                  </span>
                )}
              </div>
              {!selectedEnv.builtin && mode === "view" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setMode("edit")}>Edit</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(selectedEnv.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {mode === "edit" ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Provider</Label>
                  <Select value={form.provider_id} onValueChange={(v) => setForm((f) => ({ ...f, provider_id: v }))}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude-cli">claude-cli</SelectItem>
                      <SelectItem value="openrouter">openrouter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Model</Label>
                  <Input
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode("view")}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
                  <span className="text-muted-foreground">ID</span>
                  <span className="font-mono">{selectedEnv.id}</span>
                  <span className="text-muted-foreground">Provider</span>
                  <span className="font-mono">{selectedEnv.provider_id}</span>
                  <span className="text-muted-foreground">Model</span>
                  <span className="font-mono">{selectedEnv.model}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          !loading && (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-sm text-muted-foreground">No environments yet.</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={handleCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New environment
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  )
}
