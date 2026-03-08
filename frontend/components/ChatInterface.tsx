"use client"

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
  Fragment,
} from "react"
import { useRouter } from "next/navigation"
import { toastError } from "@/lib/toast"
import { Send, Square, Pin, Archive } from "lucide-react"
import { api } from "@/lib/api"
import type { SessionView, SkillConfig } from "@/lib/api"
import type { ChatMessage, Block, ToolBlock, ChatAskBlock, ChatFormBlock } from "@/lib/types"
import { useChatWebSocket, type WsEvent } from "@/hooks/use-chat-websocket"
import { AgentBubble } from "@/components/chat/AgentBubble"
import { UserBubble } from "@/components/chat/UserBubble"
import { WritingIndicator } from "@/components/chat/WritingIndicator"
import { SystemPromptBubble } from "@/components/chat/SystemPromptBubble"
import { ContextDividerBar } from "@/components/chat/ContextDividerBar"
import { SlashCommandPicker, type CommandItem } from "@/components/chat/SlashCommandPicker"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SCROLL_NEAR_BOTTOM_PX = 120
const TEXTAREA_MAX_HEIGHT_PX = 200

const BUILTIN_COMMANDS: CommandItem[] = [
  { kind: "command", id: "new", label: "/new", description: "Reset context — start fresh, no history passed to LLM" },
  { kind: "command", id: "compact", label: "/compact", description: "Compact context — summarize conversation then continue" },
]

const MemoAgentBubble = memo(AgentBubble)
const MemoUserBubble = memo(UserBubble)

interface ChatInterfaceProps {
  sessionId: string
}

function toolInputSummary(name: string, args: Record<string, unknown>): string {
  if (typeof args.command === "string") return args.command.split("\n")[0]
  if (typeof args.url === "string") return args.url
  const keys = Object.keys(args)
  if (!keys.length) return ""
  return String(args[keys[0]]).slice(0, 80)
}

function messageViewToChatMessage(
  mv: SessionView["messages"][number],
  id: string
): ChatMessage {
  // Divider messages render as context boundary markers, not chat bubbles
  if (mv.divider) {
    return {
      id,
      role: "user",
      blocks: [],
      done: true,
      divider: mv.divider,
      summary: mv.content || undefined,
      systemPrompt: mv.system_prompt || undefined,
    }
  }

  if (mv.role === "user") {
    return {
      id,
      role: "user",
      blocks: [{ type: "text", content: mv.content }],
      done: true,
      timestamp: mv.timestamp,
    }
  }
  // assistant — tool calls come before the final text (session.py only saves post-tool text)
  const blocks: Block[] = []
  for (const tc of mv.tool_calls) {
    const tcArgs = tc.input ?? {}
    const toolBlock: ToolBlock = {
      type: "tool",
      id: tc.id,
      name: tc.tool,
      args: tcArgs,
      result: tc.output_summary ?? undefined,
      status: tc.status,
      inputSummary: tc.input_summary || toolInputSummary(tc.tool, tcArgs) || undefined,
    }
    blocks.push(toolBlock)
  }
  if (mv.content) {
    blocks.push({ type: "text", content: mv.content })
  }
  return {
    id,
    role: "assistant",
    blocks,
    done: true,
    timestamp: mv.timestamp,
  }
}

export function ChatInterface({ sessionId }: ChatInterfaceProps) {
  const router = useRouter()

  const [session, setSession] = useState<SessionView | null>(null)
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([])
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null)
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [commandPending, setCommandPending] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [skills, setSkills] = useState<SkillConfig[]>([])
  const [pickerIndex, setPickerIndex] = useState(0)
  // Slash command picker — computed early so useEffect can depend on pickerQuery
  const showPickerBase = input.startsWith("/") && !input.includes(" ")
  const pickerQuery = showPickerBase ? input.slice(1).toLowerCase() : ""
  const scrollRef = useRef<HTMLDivElement>(null)
  const initialScrolledRef = useRef(false)
  const forceScrollRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Streaming state refs — these are updated inside WS callbacks
  // Ordered blocks array maintains interleaved text+tool order
  const streamingBlocksRef = useRef<Block[]>([])
  const streamingToolMapRef = useRef<Map<string, ToolBlock>>(new Map())
  const streamingMsgIdRef = useRef<string>(randomId())

  const [isStreaming, setIsStreaming] = useState(false)

  const sessionRef = useRef<SessionView | null>(null)
  // Indirection refs — allow hook call to precede handleEvent definition
  const handleEventRef = useRef<(event: WsEvent) => void>(() => {})

  // Keep sessionRef in sync so WS callbacks always read the latest session
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Build the streaming ChatMessage from current refs
  const buildStreamingMessage = useCallback((): ChatMessage => {
    return {
      id: streamingMsgIdRef.current,
      role: "assistant",
      agentId: sessionRef.current?.agent.id,
      blocks: [...streamingBlocksRef.current],
      done: false,
    }
  }, [])

  // Load session + history + system prompt
  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.getSession(sessionId),
      api.getSystemPrompt(sessionId),
    ])
      .then(([s, sp]) => {
        if (cancelled) return
        setSession(s)
        setEditTitle(s.title)
        const msgs: ChatMessage[] = s.messages.map((mv, i) =>
          messageViewToChatMessage(mv, `hist-${i}`)
        )
        setHistoryMessages(msgs)
        setSystemPrompt(sp.content)
      })
      .catch(() => {
        if (!cancelled) toastError("Failed to load session")
      })
    return () => { cancelled = true }
  }, [sessionId])

  // Load skills once for the slash command picker
  useEffect(() => {
    api.listSkills().then(setSkills).catch(() => {})
  }, [])

  // Reset picker selection when query changes
  useEffect(() => {
    setPickerIndex(0)
  }, [pickerQuery])

  // Hook call comes first so sendRaw is available to handleEvent below
  const { status, isConnected, sendRaw, sendMessage, sendCommand, sendStop } =
    useChatWebSocket({ sessionId, onMessage: (e) => handleEventRef.current(e) })

  const handleEvent = useCallback((event: WsEvent) => {
    const type = event.type

    if (type === "__open__") {
      // Check sessionStorage for an initial message queued before the WS was ready
      const key = `init:${sessionId}`
      const initMsg = sessionStorage.getItem(key)
      if (!initMsg) return
      sessionStorage.removeItem(key)
      const userMsg: ChatMessage = {
        id: randomId(),
        role: "user",
        blocks: [{ type: "text", content: initMsg }],
        done: true,
      }
      setHistoryMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      sendRaw({ type: "user_message", content: initMsg })
      return
    }

    if (type === "text_chunk") {
      setIsStreaming(true)
      const content = (event.content as string) || ""
      const blocks = streamingBlocksRef.current
      const last = blocks[blocks.length - 1]
      if (last && last.type === "text") {
        streamingBlocksRef.current = [
          ...blocks.slice(0, -1),
          { ...last, content: last.content + content },
        ]
      } else {
        streamingBlocksRef.current = [...blocks, { type: "text", content }]
      }
      setStreamingMessage(buildStreamingMessage())
    } else if (type === "tool_start") {
      setIsStreaming(true)
      const id = event.tool_call_id as string
      const toolName = event.tool as string
      const toolArgs = (event.input as Record<string, unknown>) || {}
      const toolBlock: ToolBlock = {
        type: "tool",
        id,
        name: toolName,
        args: toolArgs,
        status: "running",
        inputSummary: toolInputSummary(toolName, toolArgs) || undefined,
      }
      streamingToolMapRef.current.set(id, toolBlock)
      streamingBlocksRef.current = [...streamingBlocksRef.current, toolBlock]
      setStreamingMessage(buildStreamingMessage())
    } else if (type === "tool_done") {
      const id = event.tool_call_id as string
      const existing = streamingToolMapRef.current.get(id)
      if (existing) {
        const finalArgs = (event.input as Record<string, unknown>) || existing.args || {}
        const updated: ToolBlock = {
          ...existing,
          args: finalArgs,
          result: event.output as string | undefined,
          status: event.error ? "error" : "done",
          inputSummary: toolInputSummary(existing.name, finalArgs) || existing.inputSummary,
        }
        streamingToolMapRef.current.set(id, updated)
        streamingBlocksRef.current = streamingBlocksRef.current.map((b) =>
          b.type === "tool" && b.id === id ? updated : b
        )
        setStreamingMessage(buildStreamingMessage())
      }
    } else if (type === "done") {
      setIsStreaming(false)
      // Only add to history if there's actual streamed content
      if (streamingBlocksRef.current.length > 0) {
        const finalMsg: ChatMessage = { ...buildStreamingMessage(), done: true }
        setHistoryMessages((prev) => [...prev, finalMsg])
      }
      setStreamingMessage(null)
      streamingBlocksRef.current = []
      streamingToolMapRef.current.clear()
      streamingMsgIdRef.current = randomId()
      setCommandPending(false)
      // Reload session to get updated title
      api.getSession(sessionId).then(setSession).catch(() => {})
    } else if (type === "error") {
      setIsStreaming(false)
      toastError((event.message as string) || "An error occurred")
      setStreamingMessage(null)
      streamingBlocksRef.current = []
      streamingToolMapRef.current.clear()
      streamingMsgIdRef.current = randomId()
      setCommandPending(false)
    } else if (type === "divider") {
      const dividerMsg: ChatMessage = {
        id: randomId(),
        role: "user",
        blocks: [],
        done: true,
        divider: event.kind as "new" | "compact",
        summary: (event.summary as string) || undefined,
        systemPrompt: (event.system_prompt as string) || undefined,
      }
      setHistoryMessages((prev) => [...prev, dividerMsg])
    } else if (type === "remote_user_message") {
      // Message arrived from external chat (e.g. Telegram) — add user bubble and prepare for streaming
      const userMsg: ChatMessage = {
        id: randomId(),
        role: "user",
        blocks: [{ type: "text", content: (event.content as string) || "" }],
        done: true,
      }
      setHistoryMessages((prev) => [...prev, userMsg])
      streamingMsgIdRef.current = randomId()
      streamingBlocksRef.current = []
      streamingToolMapRef.current.clear()
    } else if (type === "interaction_request") {
      const askBlock: ChatAskBlock = {
        type: "chat_ask",
        requestId: event.request_id as string,
        question: event.question as string,
        inputType: (event.input_type as ChatAskBlock["inputType"]) || "text",
        options: (event.options as string[]) || [],
      }
      streamingBlocksRef.current = [...streamingBlocksRef.current, askBlock]
      forceScrollRef.current = true
      setStreamingMessage(buildStreamingMessage())
    } else if (type === "interaction_form") {
      const formBlock: ChatFormBlock = {
        type: "chat_form",
        requestId: event.request_id as string,
        questions: (event.questions as ChatFormBlock["questions"]) || [],
        paginated: (event.paginated as boolean) ?? false,
      }
      streamingBlocksRef.current = [...streamingBlocksRef.current, formBlock]
      forceScrollRef.current = true
      setStreamingMessage(buildStreamingMessage())
    }
    // pong / ping / heartbeat_fired — no UI action needed
  }, [sessionId, buildStreamingMessage, sendRaw])

  // Keep the ref current so the hook always dispatches to the latest handleEvent
  handleEventRef.current = handleEvent

  // Scroll to bottom on initial load
  useEffect(() => {
    if (historyMessages.length > 0 && !initialScrolledRef.current) {
      initialScrolledRef.current = true
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [historyMessages])

  // Auto-scroll when new messages arrive or streaming updates — only if already near bottom
  // Always scroll when an interaction (questionary) appears
  useEffect(() => {
    if (!initialScrolledRef.current) return
    const el = scrollRef.current
    if (!el) return
    const force = forceScrollRef.current
    forceScrollRef.current = false
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_NEAR_BOTTOM_PX
    if (force || nearBottom) el.scrollTop = el.scrollHeight
  }, [historyMessages, streamingMessage])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX) + "px"
  }, [input])

  // Focus textarea on mount
  useEffect(() => {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText !== undefined ? overrideText : input).trim()
    if (!text || isStreaming || commandPending) return
    if (!isConnected) {
      toastError("Not connected — please wait for reconnection and try again")
      return
    }

    // Handle context-reset commands
    if (text === "/new" || text === "/compact") {
      setInput("")
      setCommandPending(true)
      sendCommand(text.slice(1))
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
      return
    }

    setInput("")
    streamingMsgIdRef.current = randomId()
    streamingBlocksRef.current = []
    streamingToolMapRef.current.clear()
    setIsStreaming(true)

    // Optimistically add user bubble
    const userMsg: ChatMessage = {
      id: randomId(),
      role: "user",
      blocks: [{ type: "text", content: text }],
      done: true,
    }
    setHistoryMessages((prev) => [...prev, userMsg])

    sendMessage(text)

    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [input, isStreaming, commandPending, isConnected, sendCommand, sendMessage])

  const handleChatAskSubmit = useCallback((requestId: string, value: string) => {
    streamingBlocksRef.current = streamingBlocksRef.current.map((b) => {
      if (b.type === "chat_ask" && b.requestId === requestId)
        return { ...b, answered: true, answer: value }
      if (b.type === "chat_form" && b.requestId === requestId) {
        try {
          return { ...b, answered: true, answers: JSON.parse(value) }
        } catch {
          return { ...b, answered: true, answers: {} }
        }
      }
      return b
    })
    setStreamingMessage(buildStreamingMessage())
    sendRaw({ type: "interaction_response", request_id: requestId, value })
  }, [buildStreamingMessage, sendRaw])

  const handleStop = useCallback(() => {
    sendStop()
    setIsStreaming(false)
    setStreamingMessage(null)
    streamingBlocksRef.current = []
    streamingToolMapRef.current.clear()
    streamingMsgIdRef.current = randomId()
  }, [sendStop])

  const selectPickerItem = useCallback((item: CommandItem) => {
    setInput(`/${item.id}`)
    setPickerIndex(0)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const inputDisabled = isStreaming || commandPending

  // Slash command picker
  const showPicker = showPickerBase && !inputDisabled
  const pickerItems: CommandItem[] = showPicker
    ? [
        ...BUILTIN_COMMANDS.filter((c) => c.id.startsWith(pickerQuery)),
        ...skills
          .filter((s) => s.id.toLowerCase().startsWith(pickerQuery))
          .map((s) => ({
            kind: "skill" as const,
            id: s.id,
            label: `/${s.id}`,
            description: s.description,
          })),
      ]
    : []
  const clampedPickerIndex = Math.min(pickerIndex, Math.max(0, pickerItems.length - 1))

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Picker navigation
      if (showPicker && pickerItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setPickerIndex((i) => (i + 1) % pickerItems.length)
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setPickerIndex((i) => (i - 1 + pickerItems.length) % pickerItems.length)
          return
        }
        if (e.key === "Tab") {
          e.preventDefault()
          selectPickerItem(pickerItems[clampedPickerIndex])
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          setInput("")
          setPickerIndex(0)
          return
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        // If picker is open and an item is highlighted, select and send immediately
        if (showPicker && pickerItems.length > 0) {
          const item = pickerItems[clampedPickerIndex]
          setInput("")
          setPickerIndex(0)
          handleSend(`/${item.id}`)
          return
        }
        handleSend()
      }
    },
    [handleSend, showPicker, pickerItems, clampedPickerIndex, selectPickerItem]
  )

  const handleTitleClick = () => {
    if (!session) return
    setIsEditingTitle(true)
    setEditTitle(session.title)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }

  const commitTitleEdit = async () => {
    if (!session) return
    const title = editTitle.trim()
    setIsEditingTitle(false)
    if (title && title !== session.title) {
      try {
        await api.renameSession(session.id, title)
        setSession((s) => s ? { ...s, title } : s)
      } catch {
        toastError("Failed to rename session")
        setEditTitle(session.title)
      }
    }
  }

  const cancelTitleEdit = () => {
    setIsEditingTitle(false)
    if (session) setEditTitle(session.title)
  }

  const handleArchive = async () => {
    if (!session) return
    try {
      await api.archiveSession(session.id)
      router.push("/chats")
    } catch {
      toastError("Failed to archive session")
    }
  }

  const handlePin = async () => {
    if (!session) return
    try {
      if (session.sticky) {
        await api.unpinSession(session.id)
        setSession((s) => s ? { ...s, sticky: false } : s)
      } else {
        await api.pinSession(session.id)
        setSession((s) => s ? { ...s, sticky: true } : s)
      }
    } catch {
      toastError("Failed to update pin")
    }
  }

  const agentColor = session?.agent.color ?? "#6b7280"
  const agentName = session?.agent.name ?? ""
  const agentId = session?.agent.id ?? "agent"

  const allMessages = historyMessages

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 min-h-[48px]">
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitleEdit()
                if (e.key === "Escape") cancelTitleEdit()
              }}
              className="w-full bg-transparent text-sm font-medium border-b border-primary focus:outline-none"
              autoFocus
            />
          ) : (
            <button
              onDoubleClick={handleTitleClick}
              className="text-sm font-medium truncate max-w-full hover:text-primary transition-colors text-left"
              title="Double-click to rename"
            >
              {session?.title ?? "Loading..."}
            </button>
          )}
        </div>

        {session && (
          <>
            {session.external_chat && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 shrink-0 hidden sm:flex items-center gap-1">
                Telegram
                {session.external_chat.name && (
                  <span className="font-medium">· {session.external_chat.name}</span>
                )}
              </span>
            )}
            <span
              className="text-xs px-2 py-0.5 rounded-full text-white shrink-0"
              style={{ backgroundColor: agentColor }}
              title={`${session.environment.name} · ${session.environment.model}`}
            >
              {agentName}
            </span>
          </>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handlePin}
            title={session?.sticky ? "Unpin" : "Pin"}
          >
            <Pin className={cn("h-3.5 w-3.5", session?.sticky && "text-primary fill-primary")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleArchive}
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-1">
          {systemPrompt && <SystemPromptBubble content={systemPrompt} />}
          {allMessages.map((msg) => {
            if (msg.divider) {
              return (
                <Fragment key={msg.id}>
                  <ContextDividerBar
                    kind={msg.divider}
                    summary={msg.summary}
                  />
                  {msg.systemPrompt && <SystemPromptBubble content={msg.systemPrompt} />}
                </Fragment>
              )
            }
            return msg.role === "user" ? (
              <MemoUserBubble key={msg.id} message={msg} />
            ) : (
              <MemoAgentBubble
                key={msg.id}
                message={msg}
                color={agentColor}
                name={agentName}
                onChatAskSubmit={handleChatAskSubmit}
              />
            )
          })}

          {/* Streaming message */}
          {streamingMessage && (
            <MemoAgentBubble
              message={streamingMessage}
              color={agentColor}
              name={agentName}
              onChatAskSubmit={handleChatAskSubmit}
            />
          )}

          {/* Writing indicator when streaming or command pending */}
          {((isStreaming && !streamingMessage) || commandPending) && (
            <div className="flex items-start gap-2 py-0.5">
              <div
                className="shrink-0 mt-0.5 size-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: agentColor }}
              >
                {agentName ? agentName[0].toUpperCase() : "A"}
              </div>
              <div
                className="rounded-2xl rounded-bl-sm shadow-sm px-3 py-2"
                style={{ backgroundColor: agentColor + "18" }}
              >
                <WritingIndicator />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="p-4 shrink-0 border-t border-border">
        <div className="max-w-3xl mx-auto relative">
          {showPicker && (
            <SlashCommandPicker
              items={pickerItems}
              selectedIndex={clampedPickerIndex}
              onSelect={selectPickerItem}
            />
          )}
          <div className="relative flex items-end rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agentName ? `@${agentId}` : "agent"}... (Shift+Enter for newline)`}
              rows={1}
              disabled={inputDisabled}
              className={cn(
                "w-full resize-none bg-transparent px-3 py-2.5 text-sm",
                "min-h-[44px] max-h-[200px] focus:outline-none",
                "placeholder:text-muted-foreground disabled:opacity-50"
              )}
            />
            <div className="shrink-0 p-2">
              {isStreaming ? (
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={handleStop}
                  title="Stop"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || commandPending}
                  title="Send"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          {status === "error" && (
            <p className="text-xs text-muted-foreground mt-1">Reconnecting…</p>
          )}
        </div>
      </div>
    </div>
  )
}
