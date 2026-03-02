"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Calendar, Clock, Play, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { api } from "@/lib/api"
import type { TaskConfig, TaskRun, AgentConfig } from "@/lib/api"
import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout"
import { SidebarPanel } from "@/components/shared/SidebarPanel"
import { ItemList } from "@/components/shared/ItemList"
import type { ListItem } from "@/components/shared/ItemList"
import { EmptyState } from "@/components/shared/EmptyState"
import { DetailPanel } from "@/components/shared/DetailPanel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { MarkdownEditor } from "@/components/shared/MarkdownEditor"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

// ── Cron helpers ──────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Daily 9am", cron: "0 9 * * *" },
  { label: "Weekdays 9am", cron: "0 9 * * 1-5" },
  { label: "Weekly Mon", cron: "0 9 * * 1" },
]

function describeCron(cron: string): string {
  const c = cron.trim()
  if (c === "0 * * * *") return "Every hour"
  if (c === "* * * * *") return "Every minute"
  const parts = c.split(/\s+/)
  if (parts.length !== 5) return ""
  const [min, hour, dom, , dow] = parts
  const days: Record<string, string> = {
    "0": "Sun", "1": "Mon", "2": "Tue", "3": "Wed",
    "4": "Thu", "5": "Fri", "6": "Sat",
  }
  const at = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`
  if (dom === "*" && dow === "*") return `Daily at ${at}`
  if (dom === "*" && dow === "1-5") return `Weekdays at ${at}`
  if (dom === "*" && dow === "0-6") return `Daily at ${at}`
  if (dom === "*" && days[dow]) return `Every ${days[dow]} at ${at}`
  return ""
}

function isValidCron(cron: string): boolean {
  return cron.trim().split(/\s+/).length === 5
}

// ── Status badge ──────────────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: TaskRun["status"] }) {
  const variants: Record<TaskRun["status"], string> = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    done: "bg-green-500/15 text-green-700 dark:text-green-400",
    failed: "bg-destructive/15 text-destructive",
  }
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", variants[status])}>
      {status}
    </span>
  )
}

// ── Empty draft ────────────────────────────────────────────────────────────────

function emptyDraft(): TaskConfig {
  return {
    name: "new-task",
    cron: "0 9 * * 1-5",
    agent_id: "assistant",
    model: null,
    prompt: "",
    enabled: true,
    sticky_session: false,
    use_main_session: false,
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

interface TasksTabProps {
  selectedName?: string | null
}

export function TasksTab({ selectedName: initialName }: TasksTabProps) {
  const router = useRouter()
  const [tasks, setTasks] = useState<TaskConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedName, setSelectedName] = useState<string | null>(initialName ?? null)
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [mainAgentConfigured, setMainAgentConfigured] = useState(false)

  const [draft, setDraft] = useState<TaskConfig | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

  const [runs, setRuns] = useState<TaskRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  const nameInputRef = useRef<HTMLInputElement>(null)

  // Load tasks and agents
  const loadTasks = async () => {
    try {
      const [taskList, agentList, settings] = await Promise.all([
        api.listTasks(),
        api.listAgents(),
        api.getSettings().catch(() => ({ main_agent_id: null })),
      ])
      setTasks(taskList)
      setAgents(agentList)
      setMainAgentConfigured(!!settings.main_agent_id)
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to load tasks")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTasks() }, [])

  // Sync URL param
  useEffect(() => {
    if (initialName) setSelectedName(initialName)
  }, [initialName])

  // Auto-select first task when none is selected
  useEffect(() => {
    if (loading || selectedName || isNew) return
    if (tasks.length > 0) {
      const first = tasks[0].name
      setSelectedName(first)
      router.replace("/tasks?id=" + encodeURIComponent(first), { scroll: false })
    }
  }, [tasks, loading, selectedName, isNew, router])

  // Populate draft from selection
  useEffect(() => {
    if (isNew) return
    if (selectedName) {
      const t = tasks.find((t) => t.name === selectedName)
      setDraft(t ? { ...t } : null)
    } else {
      setDraft(null)
    }
  }, [selectedName, tasks, isNew])

  // Load run history
  useEffect(() => {
    if (!selectedName || isNew) { setRuns([]); return }
    setRunsLoading(true)
    api.listTaskRuns(selectedName)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false))
  }, [selectedName, isNew])

  // Create new
  const startCreating = () => {
    setIsNew(true)
    setSelectedName(null)
    setDraft(emptyDraft())
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  const cancelCreate = () => {
    setIsNew(false)
    setDraft(null)
  }

  // Save
  const handleSave = async () => {
    if (!draft) return
    if (!draft.name.trim()) { toastError("Name is required"); return }
    if (!isValidCron(draft.cron)) { toastError("Valid cron expression required (5 parts)"); return }
    if (!draft.prompt.trim()) { toastError("Prompt is required"); return }

    setSaving(true)
    try {
      if (isNew) {
        const created = await api.createTask(draft)
        setIsNew(false)
        await loadTasks()
        setSelectedName(created.name)
        router.push("/tasks?id=" + encodeURIComponent(created.name))
        toast.success("Task created")
      } else if (selectedName) {
        const updated = await api.updateTask(selectedName, draft)
        setTasks((prev) => prev.map((t) => t.name === selectedName ? updated : t))
        setDraft({ ...updated })
        toast.success("Task saved")
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  // Toggle enabled (immediate)
  const handleToggleEnabled = async () => {
    if (!selectedName || isNew || !draft) return
    const enabled = !draft.enabled
    try {
      const updated = await api.updateTask(selectedName, { enabled })
      setTasks((prev) => prev.map((t) => t.name === selectedName ? updated : t))
      setDraft((d) => d ? { ...d, enabled } : d)
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update")
    }
  }

  // Run now
  const handleRunNow = async () => {
    if (!selectedName) return
    setRunning(true)
    try {
      await api.runTask(selectedName)
      toast.success("Task triggered — run started")
      // Refresh run history
      setTimeout(() => {
        api.listTaskRuns(selectedName).then(setRuns).catch(() => {})
      }, 1500)
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to run task")
    } finally {
      setRunning(false)
    }
  }

  // Delete
  const handleDelete = async () => {
    if (!selectedName) return
    if (!confirm(`Delete task "${selectedName}"? This cannot be undone.`)) return
    try {
      await api.deleteTask(selectedName)
      const remaining = tasks.filter((t) => t.name !== selectedName)
      setTasks(remaining)
      const next = remaining.length > 0 ? remaining[0].name : null
      setSelectedName(next)
      setDraft(null)
      if (next) router.replace("/tasks?id=" + encodeURIComponent(next))
      else router.replace("/tasks")
      toast.success("Task deleted")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete")
    }
  }

  // Dirty check
  const isDirty = (() => {
    if (isNew) return true
    if (!selectedName || !draft) return false
    const original = tasks.find((t) => t.name === selectedName)
    if (!original) return false
    return (
      draft.cron !== original.cron ||
      draft.agent_id !== original.agent_id ||
      (draft.model ?? null) !== (original.model ?? null) ||
      draft.prompt !== original.prompt ||
      draft.sticky_session !== original.sticky_session ||
      draft.use_main_session !== original.use_main_session
    )
  })()

  // Build list items
  const listItems: ListItem[] = tasks.map((t) => {
    const cronDesc = describeCron(t.cron) || t.cron
    const promptPreview = t.prompt.length > 60 ? t.prompt.slice(0, 60) + "…" : t.prompt
    return {
    id: t.name,
    label: t.name,
    sublabel: promptPreview ? `${cronDesc} · ${promptPreview}` : cronDesc,
    badge: (
      <div className="flex items-center gap-1">
        {!t.enabled && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 opacity-60">
            off
          </Badge>
        )}
      </div>
    ),
    actions: [
      {
        label: t.enabled ? "Disable" : "Enable",
        onClick: async () => {
          try {
            const updated = await api.updateTask(t.name, { enabled: !t.enabled })
            setTasks((prev) => prev.map((x) => x.name === t.name ? updated : x))
          } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to update")
          }
        },
      },
      {
        label: "Run now",
        onClick: async () => {
          try {
            await api.runTask(t.name)
            toast.success(`Task "${t.name}" triggered`)
          } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to run")
          }
        },
      },
      {
        label: "Delete",
        variant: "destructive" as const,
        onClick: async () => {
          if (!confirm(`Delete task "${t.name}"?`)) return
          try {
            await api.deleteTask(t.name)
            const remaining = tasks.filter((x) => x.name !== t.name)
            setTasks(remaining)
            if (selectedName === t.name) {
              const next = remaining.length > 0 ? remaining[0].name : null
              setSelectedName(next)
              setDraft(null)
              if (next) router.replace("/tasks?id=" + encodeURIComponent(next))
              else router.replace("/tasks")
            }
            toast.success("Task deleted")
          } catch (err) {
            toastError(err instanceof Error ? err.message : "Failed to delete")
          }
        },
      },
    ],
  }
  })

  const sidebar = (
    <SidebarPanel
      title="Tasks"
      path="~/.yapflows/tasks/"
      onRefresh={loadTasks}
      onCreate={startCreating}
      createDisabled={isNew}
      createTooltip="New task"
    >
      {loading ? (
        <div className="space-y-1 p-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : (
        <>
          {isNew && (
            <div className="mx-1 my-1 px-2 py-2 rounded-md bg-accent text-sm italic text-muted-foreground">
              New task (unsaved)
            </div>
          )}
          <ItemList
            items={listItems}
            selectedId={isNew ? undefined : (selectedName ?? undefined)}
            onSelect={(id) => {
              setIsNew(false)
              setSelectedName(id)
              router.push("/tasks?id=" + encodeURIComponent(id))
            }}
            emptyMessage="No tasks yet. Click + to create one."
          />
        </>
      )}
    </SidebarPanel>
  )

  const main = !draft ? (
    <EmptyState
      icon={<Calendar className="w-10 h-10" />}
      title="No task selected"
      description="Select a task from the sidebar or create a new one."
    />
  ) : (
    <DetailPanel
      title={isNew ? "New Task" : selectedName ?? ""}
      subtitle={!isNew && draft.cron ? (describeCron(draft.cron) || draft.cron) : undefined}
      actions={
        <div className="flex items-center gap-2">
          {isNew ? (
            <>
              <Button variant="ghost" size="sm" onClick={cancelCreate}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !isDirty}>
                {saving ? "Creating..." : "Create"}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !isDirty}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunNow}
                disabled={running}
                className="gap-1.5"
              >
                {running ? <Spinner className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {running ? "Running..." : "Run now"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleEnabled}
                className={cn(
                  "text-xs h-7",
                  draft.enabled
                    ? "border-emerald-500/50 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                    : "text-muted-foreground"
                )}
              >
                {draft.enabled ? "Enabled" : "Disabled"}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="p-6 max-w-2xl space-y-5">
        {/* Name (only editable when creating) */}
        {isNew && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Name</Label>
            <Input
              ref={nameInputRef}
              value={draft.name}
              onChange={(e) => setDraft((d) => d ? { ...d, name: e.target.value } : d)}
              placeholder="daily-standup"
              className="h-8 text-sm font-mono"
            />
          </div>
        )}

        {/* Agent */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Agent</Label>
          <Select
            value={draft.agent_id}
            onValueChange={(v) => setDraft((d) => d ? { ...d, agent_id: v } : d)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
              {agents.length === 0 && (
                <SelectItem value={draft.agent_id}>{draft.agent_id}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Model (optional) */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Model override (optional)</Label>
          <Input
            value={draft.model ?? ""}
            onChange={(e) => setDraft((d) => d ? { ...d, model: e.target.value || null } : d)}
            placeholder="Leave blank to use agent default"
            className="h-8 text-sm font-mono"
          />
        </div>

        {/* Cron */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Cron schedule</Label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.cron}
                type="button"
                onClick={() => setDraft((d) => d ? { ...d, cron: p.cron } : d)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-full border transition-colors",
                  draft.cron === p.cron
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Input
            value={draft.cron}
            onChange={(e) => setDraft((d) => d ? { ...d, cron: e.target.value } : d)}
            placeholder="0 9 * * 1-5"
            className="h-8 text-sm font-mono"
          />
          {draft.cron && (
            <p className="text-xs text-muted-foreground">
              {describeCron(draft.cron) ||
                (isValidCron(draft.cron) ? "Custom schedule" : "Invalid — needs 5 space-separated parts")}
            </p>
          )}
        </div>

        {/* Prompt */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Prompt</Label>
          <MarkdownEditor
            value={draft.prompt}
            onChange={(v) => setDraft((d) => d ? { ...d, prompt: v } : d)}
            onReload={() => {
              if (!selectedName || isNew) return
              api.getTask(selectedName).then((t) => setDraft({ ...t })).catch(() => {})
            }}
            placeholder="Generate my daily standup report"
            filePath={!isNew ? (draft.file_path ?? undefined) : undefined}
            updatedAt={!isNew ? (draft.updated_at ?? undefined) : undefined}
          />
          <p className="text-xs text-muted-foreground">Sent as a message to the agent on every trigger.</p>
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.sticky_session}
              onChange={(e) => setDraft((d) => d ? { ...d, sticky_session: e.target.checked } : d)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">Sticky session</span>
            <span className="text-xs text-muted-foreground">(reuse the same session across runs)</span>
          </label>
          <label className={cn("flex items-center gap-2", mainAgentConfigured ? "cursor-pointer" : "opacity-50 cursor-not-allowed")}>
            <input
              type="checkbox"
              checked={draft.use_main_session}
              onChange={(e) => setDraft((d) => d ? { ...d, use_main_session: e.target.checked } : d)}
              disabled={!mainAgentConfigured}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">Post to main session</span>
            <span className="text-xs text-muted-foreground">
              {mainAgentConfigured
                ? "(sends prompt to the global assistant chat)"
                : "(set a main session agent in Settings first)"}
            </span>
          </label>
        </div>

        {/* Run history */}
        {!isNew && selectedName && (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Run History
            </div>
            {runsLoading ? (
              <div className="space-y-1">
                {[1, 2].map((i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
              </div>
            ) : runs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">
                No runs yet. Click <strong>Run now</strong> to trigger manually.
              </p>
            ) : (
              <div className="space-y-0.5">
                {runs.map((run) => {
                  const scheduledDate = new Date(run.scheduled_at)
                  const dateStr = scheduledDate.toLocaleDateString(undefined, {
                    month: "short", day: "numeric", year: "numeric",
                  })
                  const timeStr = scheduledDate.toLocaleTimeString(undefined, {
                    hour: "2-digit", minute: "2-digit",
                  })
                  return (
                    <div
                      key={run.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{dateStr} · {timeStr}</span>
                          <RunStatusBadge status={run.status} />
                          {run.status === "running" && <Spinner className="h-3 w-3 text-blue-500" />}
                        </div>
                        {run.error && (
                          <p className="text-xs text-destructive truncate mt-0.5">{run.error}</p>
                        )}
                      </div>
                      {run.session_id && (
                        <button
                          onClick={() => router.push("/chats?id=" + encodeURIComponent(run.session_id!) + "&filter=scheduled")}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 shrink-0"
                        >
                          View session
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </DetailPanel>
  )

  return (
    <TwoPaneLayout
      sidebar={sidebar}
      main={main}
      defaultSidebarWidth={260}
      minSidebarWidth={200}
      maxSidebarWidth={400}
    />
  )
}
