"use client"
import { useEffect, useRef, useState, useCallback } from "react"

export interface StreamingMessage {
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
  toolCalls?: StreamingToolCall[]
}

export interface StreamingToolCall {
  id: string
  tool: string
  inputSummary: string
  outputSummary?: string | null
  status: "running" | "done" | "error"
  durationMs?: number | null
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

interface UseChatWebSocketOptions {
  sessionId: string | null
  onMessage?: (messages: StreamingMessage[]) => void
}

export function useChatWebSocket({ sessionId, onMessage }: UseChatWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")
  const [isStreaming, setIsStreaming] = useState(false)
  const streamingContentRef = useRef("")
  const streamingToolCallsRef = useRef<Map<string, StreamingToolCall>>(new Map())

  const connect = useCallback(() => {
    if (!sessionId) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus("connecting")
    const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => setStatus("connected")
    ws.onclose = () => {
      setStatus("disconnected")
      setIsStreaming(false)
    }
    ws.onerror = () => setStatus("error")

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        handleEvent(event)
      } catch {}
    }
  }, [sessionId])

  const handleEvent = useCallback((event: Record<string, unknown>) => {
    const type = event.type as string

    if (type === "text_chunk") {
      streamingContentRef.current += (event.content as string) || ""
      setIsStreaming(true)
    } else if (type === "tool_start") {
      const id = event.tool_call_id as string
      streamingToolCallsRef.current.set(id, {
        id,
        tool: event.tool as string,
        inputSummary: JSON.stringify(event.input || {}).slice(0, 80),
        status: "running",
      })
    } else if (type === "tool_done") {
      const id = event.tool_call_id as string
      const existing = streamingToolCallsRef.current.get(id)
      if (existing) {
        streamingToolCallsRef.current.set(id, {
          ...existing,
          outputSummary: (event.output as string)?.slice(0, 100),
          status: event.error ? "error" : "done",
        })
      }
    } else if (type === "done") {
      setIsStreaming(false)
      streamingContentRef.current = ""
      streamingToolCallsRef.current.clear()
    } else if (type === "error") {
      setIsStreaming(false)
      streamingContentRef.current = ""
      streamingToolCallsRef.current.clear()
    }
  }, [])

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: "user_message", content }))
    setIsStreaming(true)
    streamingContentRef.current = ""
    streamingToolCallsRef.current.clear()
  }, [])

  const stop = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "stop" }))
    setIsStreaming(false)
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  return {
    status,
    isStreaming,
    sendMessage,
    stop,
    connect,
    streamingContent: streamingContentRef,
    streamingToolCalls: streamingToolCallsRef,
  }
}
