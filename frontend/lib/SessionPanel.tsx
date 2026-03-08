"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toastError } from "@/lib/toast"
import { Pin, MessageSquare, Calendar, Sparkles, MoreHorizontal, Plus, Send } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { api } from "@/lib/api"
import type { SessionView, AgentConfig, EnvironmentConfig } from "@/lib/api"
import { SidebarPanel } from "@/components/shared/SidebarPanel"
import { ItemList } from "@/components/shared/ItemList"
import type { ListItem } from "@/components/shared/ItemList"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants, Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AgentPickerButton } from "@/components/AgentPickerButton"
import { EnvironmentPickerButton } from "@/components/EnvironmentPickerButton"
import { useDefaultAgent } from "@/hooks/use-default-agent"
import { useDefaultEnvironment } from "@/hooks/use-default-environment"

type FilterTab = "active" | "archived" | "scheduled"

function formatTime(ts: string): string {
  try {
    const utc = ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z"
    return formatDistanceToNow(new Date(utc), { addSuffix: true })
  } catch {
    return ""
  }
}

interface SessionPanelProps {
  className?: string
}

export function SessionPanel({ className }: SessionPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get("id")

  const [sessions, setSessions] = useState<SessionView[]>([])
  const [loading, setLoading] = useState(false)
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([])
  const { agentId, setDefault } = useDefaultAgent(agents)
  const { environmentId, setDefault: setDefaultEnv } = useDefaultEnvironment(environments)

  const filterParam = searchParams.get("filter")
  const filter: FilterTab = (["active", "archived", "scheduled"].includes(filterParam ?? "")
    ? filterParam
    : "active") as FilterTab

  const setFilter = (tab: FilterTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("filter", tab)
    router.replace(`/chats?${params.toString()}`, { scroll: false })
  }

  // Rename dialog
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Delete confirm dialog
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Alias dialog
  const [aliasOpen, setAliasOpen] = useState(false)
  const [aliasSessionId, setAliasSessionId] = useState<string | null>(null)
  const [aliasValue, setAliasValue] = useState("")

  const openAliasDialog = (id: string, current: string | null) => {
    setAliasSessionId(id)
    setAliasValue(current ?? "")
    setAliasOpen(true)
  }

  const confirmAlias = async () => {
    if (!aliasSessionId) return
    const alias = aliasValue.trim() || null
    await handleSetAlias(aliasSessionId, alias)
    setAliasOpen(false)
  }

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const all = await api.listSessions()
      setSessions(all)
    } catch {
      toastError("Failed to load sessions")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
    api.listAgents().then(setAgents).catch(() => toastError("Failed to load agents"))
    api.listEnvironments().then(setEnvironments).catch(() => toastError("Failed to load environments"))
  }, [loadSessions])

  // Auto-select most recent session on load when no session is selected
  useEffect(() => {
    if (loading || selectedId) return
    const active = sessions.filter((s) => !s.archived && (s.source !== "scheduled" || s.alias === "main"))
    // Prefer main-aliased session if available
    const main = active.find((s) => s.alias === "main")
    const first = main ?? active[0]
    if (first) {
      router.replace(`/chats?id=${first.id}`, { scroll: false })
    }
  }, [sessions, loading, selectedId, router])

  const handleNewChat = async () => {
    try {
      if (!agentId) {
        toastError("No agents configured. Please create an agent first.")
        return
      }
      if (!environmentId) {
        toastError("No environments configured. Please create an environment first.")
        return
      }
      const session = await api.createSession({ agent_id: agentId, environment_id: environmentId })
      await loadSessions()
      router.push(`/chats?id=${session.id}`)
    } catch {
      toastError("Failed to create new chat")
    }
  }

  const handleSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("id", id)
    router.push(`/chats?${params.toString()}`, { scroll: false })
  }

  const openRenameDialog = (id: string, title: string) => {
    setRenameId(id)
    setRenameTitle(title)
    setRenameOpen(true)
  }

  const confirmRename = async () => {
    if (!renameId) return
    const id = renameId
    const title = renameTitle.trim()
    if (title) {
      try {
        await api.renameSession(id, title)
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, title } : s))
        )
      } catch {
        toastError("Failed to rename session")
      }
    }
  }

  const handlePin = async (id: string, pinned: boolean) => {
    try {
      if (pinned) {
        await api.unpinSession(id)
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, sticky: false } : s)))
      } else {
        await api.pinSession(id)
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, sticky: true } : s)))
      }
    } catch {
      toastError("Failed to update pin status")
    }
  }

  const handleSetAlias = async (id: string, alias: string | null) => {
    try {
      await api.setSessionAlias(id, alias)
      setSessions((prev) => prev.map((s) => {
        if (alias !== null && s.alias === alias && s.id !== id) return { ...s, alias: null }
        if (s.id === id) return { ...s, alias, sticky: alias !== null ? true : s.sticky }
        return s
      }))
    } catch {
      toastError(alias ? "Failed to set alias" : "Failed to remove alias")
    }
  }

  const handleArchive = async (id: string) => {
    try {
      await api.archiveSession(id)
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, archived: true } : s)))
      if (selectedId === id) {
        router.push("/chats", { scroll: false })
      }
    } catch {
      toastError("Failed to archive session")
    }
  }

  const handleRestore = async (id: string) => {
    try {
      await api.restoreSession(id)
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, archived: false } : s)))
      setFilter("active")
    } catch {
      toastError("Failed to restore session")
    }
  }

  const confirmDelete = async (id: string) => {
    try {
      await api.deleteSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (selectedId === id) {
        router.push("/chats", { scroll: false })
      }
    } catch {
      toastError("Failed to delete session")
    }
  }

  // "main"-aliased session — always pinned at top of Active tab
  const mainSession = sessions.find((s) => s.alias === "main" && !s.archived) ?? null

  // Filter sessions by tab (main-aliased session excluded — rendered separately above the list)
  const filteredSessions = sessions.filter((s) => {
    if (s.alias === "main") return false  // rendered separately above the list
    if (filter === "archived") return s.archived
    if (filter === "scheduled") return !s.archived && s.source === "scheduled"
    return !s.archived && s.source !== "scheduled"
  })

  // Sort: sticky first, then by updated_at desc
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    if (a.sticky && !b.sticky) return -1
    if (!a.sticky && b.sticky) return 1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  const firstUnpinnedIdx = sortedSessions.findIndex((s) => !s.sticky)
  const hasPinnedAbove = firstUnpinnedIdx > 0

  const items: ListItem[] = sortedSessions.map((session, idx) => ({
    id: session.id,
    label: session.title,
    sublabel: session.external_chat
      ? `${session.agent.name} · ${session.external_chat.name || session.external_chat.chat_id} · ${formatTime(session.updated_at)}`
      : `${session.agent.name} · ${formatTime(session.updated_at)}`,
    icon: session.external_chat
      ? <Send className="w-3.5 h-3.5 text-sky-500" />
      : session.source === "scheduled"
          ? <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          : session.sticky
            ? <Pin className="w-3.5 h-3.5 text-primary" />
            : <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />,
    badge: (session.alias || session.unread) ? (
      <span className="flex items-center gap-1 shrink-0">
        {session.alias && (
          <span className={cn(
            "text-[9px] font-semibold px-1 py-px rounded uppercase tracking-wide leading-none",
            selectedId === session.id
              ? "bg-white/20 text-white"
              : "bg-primary/15 text-primary"
          )}>
            {session.alias}
          </span>
        )}
        {session.unread && (
          <span className={cn(
            "w-2 h-2 rounded-full",
            selectedId === session.id ? "bg-white" : "bg-primary"
          )} title="Unread" />
        )}
      </span>
    ) : undefined,
    dividerBefore: hasPinnedAbove && idx === firstUnpinnedIdx,
    actions: filter === "archived"
      ? [
          {
            label: "Restore",
            onClick: () => handleRestore(session.id),
          },
          {
            label: "Delete",
            onClick: () => setDeleteId(session.id),
            variant: "destructive" as const,
          },
        ]
      : [
          {
            label: "Rename",
            onClick: () => openRenameDialog(session.id, session.title),
          },
          {
            label: session.sticky ? "Unpin" : "Pin",
            onClick: () => handlePin(session.id, session.sticky),
          },
          {
            label: "Set alias…",
            onClick: () => openAliasDialog(session.id, session.alias ?? null),
          },
          {
            label: "Archive",
            onClick: () => handleArchive(session.id),
          },
          {
            label: "Delete",
            onClick: () => setDeleteId(session.id),
            variant: "destructive" as const,
          },
        ],
  }))

  const filterBar = (
    <div>
      <div className="flex rounded-md bg-muted mx-3 mt-2 mb-1.5 p-0.5 gap-0.5">
        {(["active", "archived", "scheduled"] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              "flex-1 text-[11px] py-1 rounded transition-colors capitalize",
              filter === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "active" ? "Active" : tab === "archived" ? "Archived" : "Scheduled"}
          </button>
        ))}
      </div>
      {filter === "active" && (
        <div className="flex items-center gap-0.5 px-2.5 pb-1.5">
          <EnvironmentPickerButton environments={environments} environmentId={environmentId} onSelect={setDefaultEnv} />
          <AgentPickerButton agents={agents} agentId={agentId} onSelect={setDefault} />
        </div>
      )}
    </div>
  )

  return (
    <div className={cn("h-full flex flex-col", className)}>
      <SidebarPanel
        title="Chats"
        onRefresh={loadSessions}
        createButton={filter === "active" ? (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat} title="New chat">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        ) : undefined}
        filter={filterBar}
      >
        {/* Aliased sessions — always pinned at top */}
        {mainSession && (
          <div className="px-1 pt-1 pb-0.5">
            <div
              className={cn(
                "group flex items-center gap-2 px-2 rounded-md border transition-colors",
                selectedId === mainSession.id
                  ? "bg-primary/10 border-primary/25"
                  : "bg-muted/60 border-border hover:bg-muted"
              )}
            >
              <button
                onClick={() => handleSelect(mainSession.id)}
                className="flex-1 flex items-center gap-2 py-2 min-w-0 text-left"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{mainSession.title}</p>
                    <span className="text-[9px] font-semibold px-1 py-px rounded bg-primary/15 text-primary uppercase tracking-wide leading-none shrink-0">
                      {mainSession.alias}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {mainSession.agent.name} · {formatTime(mainSession.updated_at)}
                  </p>
                </div>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 shrink-0">
                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                  <DropdownMenuItem onClick={() => openRenameDialog(mainSession.id, mainSession.title)}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openAliasDialog(mainSession.id, mainSession.alias ?? null)}>
                    Edit alias…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleArchive(mainSession.id)}
                    className="text-destructive"
                  >
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {items.length > 0 && (
              <div className="mx-3 my-2 border-t border-border" />
            )}
          </div>
        )}

        <ItemList
          items={items}
          selectedId={selectedId ?? undefined}
          onSelect={handleSelect}
          emptyMessage={
            loading
              ? "Loading..."
              : filter === "archived"
                ? "No archived chats."
                : filter === "scheduled"
                  ? "No scheduled runs yet."
                  : mainSession
                    ? ""
                    : "No chats yet. Hit + to start one!"
          }
        />
      </SidebarPanel>

      {/* Rename dialog */}
      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename chat</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            ref={renameInputRef}
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); confirmRename() }
            }}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "default" })}
              onClick={confirmRename}
            >
              Rename
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) confirmDelete(deleteId) }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alias dialog */}
      <AlertDialog open={aliasOpen} onOpenChange={setAliasOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set alias</AlertDialogTitle>
            <AlertDialogDescription>
              Give this chat a short alias (e.g. "main", "work"). Leave empty to remove. Each alias can only be used once.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={aliasValue}
            onChange={(e) => setAliasValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmAlias() } }}
            placeholder="e.g. main"
            autoFocus
          />
          {aliasValue.trim() && sessions.some((s) => s.alias === aliasValue.trim() && s.id !== aliasSessionId) && (
            <p className="text-xs text-amber-500">
              Already used by another chat — saving will move the alias here.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAlias}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
