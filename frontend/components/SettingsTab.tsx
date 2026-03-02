"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle, XCircle, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { api } from "@/lib/api"
import type { AgentConfig } from "@/lib/api"
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

// ── Main SettingsTab ───────────────────────────────────────────────────────────

export function SettingsTab() {
  const router = useRouter()

  // OpenRouter API key
  const [apiKey, setApiKey] = useState("")
  const [testState, setTestState] = useState<TestState>("idle")
  const [testError, setTestError] = useState<string | null>(null)

  // Leader key
  const [leaderKey, setLeaderKey] = useState("\\")

  // Log level
  const [logLevel, setLogLevel] = useState("info")

  // Main session
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [mainAgentId, setMainAgentId] = useState<string>("__none__")

  // Telegram
  const [tgBotToken, setTgBotToken] = useState("")
  const [tgChats, setTgChats] = useState<{ name: string; chat_id: string }[]>([])

  // Saving state
  const [saving, setSaving] = useState(false)

  // Load settings and agents on mount
  useEffect(() => {
    Promise.all([
      api.listAgents().catch(() => [] as AgentConfig[]),
      api.getSettings().catch(() => ({ main_agent_id: null, main_session_id: null, telegram: undefined })),
    ]).then(([agentList, settings]) => {
      setAgents(agentList)
      setMainAgentId(settings.main_agent_id ?? "__none__")
      if (settings.telegram) {
        setTgBotToken(settings.telegram.bot_token ?? "")
        setTgChats(settings.telegram.chats ?? [])
      }
    })
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
          leader_key: leaderKey,
          log_level: logLevel,
        }),
        api.patchSettings({
          main_agent_id: mainAgentId === "__none__" ? null : mainAgentId,
          telegram: { bot_token: tgBotToken, chats: tgChats },
        }),
      ])
      toast.success("Settings saved")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const addTgChat = () => setTgChats((prev) => [...prev, { name: "", chat_id: "" }])
  const removeTgChat = (i: number) => setTgChats((prev) => prev.filter((_, idx) => idx !== i))
  const updateTgChat = (i: number, field: "name" | "chat_id", value: string) =>
    setTgChats((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">Settings</h1>
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
              description="Single character used as the keyboard shortcut prefix."
            >
              <Input
                value={leaderKey}
                onChange={(e) => setLeaderKey(e.target.value.slice(-1) || leaderKey)}
                className="w-20 font-mono text-center"
                maxLength={1}
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

        {/* Main session section */}
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Main Session
          </h2>
          <div className="border border-border rounded-lg px-4">
            <FormRow
              label="Main session agent"
              description="Agent that drives the global always-on chat. Tasks with 'Post to main session' enabled will post here."
            >
              <Select
                value={mainAgentId}
                onValueChange={setMainAgentId}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="None (disabled)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (disabled)</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <div className="space-y-2">
                {tgChats.map((chat, i) => (
                  <div key={i} className="flex items-center gap-2">
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
