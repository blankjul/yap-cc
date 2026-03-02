"use client"

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
} from "react"
import { useRouter } from "next/navigation"
import { toastError } from "@/lib/toast"
import { Send, Square, Pin, Archive } from "lucide-react"
import { api } from "@/lib/api"
import type { SessionView, AgentConfig } from "@/lib/api"
import type { ChatMessage, Block, ToolBlock, ChatAskBlock, ChatFormBlock } from "@/lib/types"
import { useChatWebSocket } from "@/hooks/use-chat-websocket"
import { AgentBubble } from "@/components/chat/AgentBubble"
import { UserBubble } from "@/components/chat/UserBubble"
import { WritingIndicator } from "@/components/chat/WritingIndicator"
import { SystemPromptBubble } from "@/components/chat/SystemPromptBubble"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MemoAgentBubble = memo(AgentBubble)
const MemoUserBubble = memo(UserBubble)

interface ChatInterfaceProps {
  sessionId: string
}

function messageViewToChatMessage(
  mv: SessionView["messages"][number],
  id: string
): ChatMessage {
  if (mv.role === "user") {
    return {
      id,
      role: "user",
      blocks: [{ type: "text", content: mv.content }],
      done: true,
    }
  }
  // assistant
  const blocks: Block[] = []
  if (mv.content) {
    blocks.push({ type: "text", content: mv.content })
  }
  for (const tc of mv.tool_calls) {
    const toolBlock: ToolBlock = {
      type: "tool",
      id: tc.id,
      name: tc.tool,
      args: {},
      result: tc.output_summary ?? undefined,
      status: tc.status,
    }
    blocks.push(toolBlock)
  }
  return {
    id,
    role: "assistant",
    blocks,
    done: true,
  }
}

export function ChatInterface({ sessionId }: ChatInterfaceProps) {
  const router = useRouter()

  const [session, setSession] = useState<SessionView | null>(null)
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([])
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null)
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const initialScrolledRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Streaming state refs — these are updated inside WS callbacks
  // Ordered blocks array maintains interleaved text+tool order
  const streamingBlocksRef = useRef<Block[]>([])
  const streamingToolMapRef = useRef<Map<string, ToolBlock>>(new Map())
  const streamingMsgIdRef = useRef<string>(crypto.randomUUID())

  const { status, isStreaming, sendMessage, stop } = useChatWebSocket({ sessionId })

  const wsRef = useRef<WebSocket | null>(null)
  const sessionRef = useRef<SessionView | null>(null)

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

  // Connect our own WS for streaming state management
  useEffect(() => {
    if (!sessionId) return

    const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      const key = `init:${sessionId}`
      const initMsg = sessionStorage.getItem(key)
      if (!initMsg) return
      sessionStorage.removeItem(key)
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        blocks: [{ type: "text", content: initMsg }],
        done: true,
      }
      setHistoryMessages((prev) => [...prev, userMsg])
      ws.send(JSON.stringify({ type: "user_message", content: initMsg }))
    }

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as Record<string, unknown>
        const type = event.type as string

        if (type === "text_chunk") {
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
          const id = event.tool_call_id as string
          const toolBlock: ToolBlock = {
            type: "tool",
            id,
            name: event.tool as string,
            args: (event.input as Record<string, unknown>) || {},
            status: "running",
          }
          streamingToolMapRef.current.set(id, toolBlock)
          streamingBlocksRef.current = [...streamingBlocksRef.current, toolBlock]
          setStreamingMessage(buildStreamingMessage())
        } else if (type === "tool_done") {
          const id = event.tool_call_id as string
          const existing = streamingToolMapRef.current.get(id)
          if (existing) {
            const updated: ToolBlock = {
              ...existing,
              result: (event.output as string)?.slice(0, 200),
              status: event.error ? "error" : "done",
            }
            streamingToolMapRef.current.set(id, updated)
            streamingBlocksRef.current = streamingBlocksRef.current.map((b) =>
              b.type === "tool" && b.id === id ? updated : b
            )
            setStreamingMessage(buildStreamingMessage())
          }
        } else if (type === "done") {
          // Finalize: move streaming to history
          const finalMsg: ChatMessage = {
            ...buildStreamingMessage(),
            done: true,
          }
          setHistoryMessages((prev) => [...prev, finalMsg])
          setStreamingMessage(null)
          streamingBlocksRef.current = []
          streamingToolMapRef.current.clear()
          streamingMsgIdRef.current = crypto.randomUUID()
          // Reload session to get updated title
          api.getSession(sessionId).then(setSession).catch(() => {})
        } else if (type === "error") {
          toastError((event.message as string) || "An error occurred")
          setStreamingMessage(null)
          streamingBlocksRef.current = []
          streamingToolMapRef.current.clear()
          streamingMsgIdRef.current = crypto.randomUUID()
        } else if (type === "remote_user_message") {
          // Message arrived from external chat (e.g. Telegram) — add user bubble and prepare for streaming
          const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            blocks: [{ type: "text", content: (event.content as string) || "" }],
            done: true,
          }
          setHistoryMessages((prev) => [...prev, userMsg])
          streamingMsgIdRef.current = crypto.randomUUID()
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
          setStreamingMessage(buildStreamingMessage())
        } else if (type === "interaction_form") {
          const formBlock: ChatFormBlock = {
            type: "chat_form",
            requestId: event.request_id as string,
            questions: (event.questions as ChatFormBlock["questions"]) || [],
            paginated: (event.paginated as boolean) ?? false,
          }
          streamingBlocksRef.current = [...streamingBlocksRef.current, formBlock]
          setStreamingMessage(buildStreamingMessage())
        }
      } catch {}
    }

    ws.onerror = () => {
      // connection errors are normal when session doesn't exist yet
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [sessionId])

  // Scroll to bottom on initial load
  useEffect(() => {
    if (historyMessages.length > 0 && !initialScrolledRef.current) {
      initialScrolledRef.current = true
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [historyMessages])

  // Auto-scroll when new messages arrive or streaming updates — only if already near bottom
  useEffect(() => {
    if (!initialScrolledRef.current) return
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [historyMessages, streamingMessage])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }, [input])

  // Focus textarea on mount
  useEffect(() => {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    setInput("")
    streamingMsgIdRef.current = crypto.randomUUID()
    streamingBlocksRef.current = []
    streamingToolMapRef.current.clear()

    // Optimistically add user bubble
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      blocks: [{ type: "text", content: text }],
      done: true,
    }
    setHistoryMessages((prev) => [...prev, userMsg])

    // Send via WS
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "user_message", content: text }))
    } else {
      // Fallback to hook's sendMessage
      sendMessage(text)
    }

    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [input, isStreaming, sendMessage])

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
    wsRef.current?.send(
      JSON.stringify({ type: "interaction_response", request_id: requestId, value })
    )
  }, [buildStreamingMessage])

  const handleStop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }))
    } else {
      stop()
    }
    setStreamingMessage(null)
    streamingBlocksRef.current = []
    streamingToolMapRef.current.clear()
    streamingMsgIdRef.current = crypto.randomUUID()
  }, [stop])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
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
              onClick={handleTitleClick}
              className="text-sm font-medium truncate max-w-full hover:text-primary transition-colors text-left"
              title="Click to rename"
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
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
              {session.agent.provider_id === "claude-cli" ? "Claude CLI" : "OpenRouter"}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full text-white shrink-0"
              style={{ backgroundColor: agentColor }}
            >
              {agentName}
            </span>
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
              {session.agent.model}
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
          {allMessages.map((msg) =>
            msg.role === "user" ? (
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
          )}

          {/* Streaming message */}
          {streamingMessage && (
            <MemoAgentBubble
              message={streamingMessage}
              color={agentColor}
              name={agentName}
              onChatAskSubmit={handleChatAskSubmit}
            />
          )}

          {/* Writing indicator when streaming but no content yet */}
          {isStreaming && !streamingMessage && (
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
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agentName ? `@${agentId}` : "agent"}... (Shift+Enter for newline)`}
              rows={1}
              disabled={isStreaming}
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
                  onClick={handleSend}
                  disabled={!input.trim()}
                  title="Send"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          {status === "error" && (
            <p className="text-xs text-destructive mt-1">Connection error. Reconnecting...</p>
          )}
        </div>
      </div>
    </div>
  )
}
