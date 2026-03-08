"use client"
import { useEffect, useRef, useState, useCallback } from "react"

export type WsEvent = Record<string, unknown> & { type: string }

type ConnectionStatus = "connecting" | "connected" | "error"

interface UseChatWebSocketOptions {
  sessionId: string | null
  onMessage: (event: WsEvent) => void
}

interface UseChatWebSocketReturn {
  status: ConnectionStatus
  isConnected: boolean
  sendRaw: (obj: unknown) => void
  sendMessage: (content: string) => void
  sendCommand: (name: string) => void
  sendStop: () => void
}

export function useChatWebSocket({
  sessionId,
  onMessage,
}: UseChatWebSocketOptions): UseChatWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>("connecting")

  // Refs that survive across reconnect cycles
  const hasConnectedRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = useRef(false)

  // Always call the latest onMessage without re-creating the WS
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const sendRaw = useCallback((obj: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj))
    }
  }, [])

  const sendMessage = useCallback(
    (content: string) => sendRaw({ type: "user_message", content }),
    [sendRaw]
  )

  const sendCommand = useCallback(
    (name: string) => sendRaw({ type: "command", name }),
    [sendRaw]
  )

  const sendStop = useCallback(
    () => sendRaw({ type: "stop" }),
    [sendRaw]
  )

  useEffect(() => {
    if (!sessionId) return

    cancelledRef.current = false
    hasConnectedRef.current = false
    reconnectAttemptRef.current = 0

    const clearPing = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current)
        pingTimerRef.current = null
      }
    }

    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    function connect() {
      if (cancelledRef.current) return

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const ws = new WebSocket(
        `${protocol}//${window.location.hostname}:8000/ws/${sessionId}`
      )
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelledRef.current) {
          ws.close()
          return
        }
        hasConnectedRef.current = true
        reconnectAttemptRef.current = 0
        setStatus("connected")

        // Client-side ping every 20s to keep proxies alive
        clearPing()
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }))
          }
        }, 20_000)

        // Signal the component that the connection is open
        onMessageRef.current({ type: "__open__" })
      }

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          if (!event || typeof event !== "object") return
          onMessageRef.current(event as WsEvent)
        } catch {
          // Ignore unparseable frames
        }
      }

      ws.onerror = () => {
        // onerror always fires before onclose; status update handled there
      }

      ws.onclose = () => {
        wsRef.current = null
        clearPing()
        if (cancelledRef.current) return

        // Only show "error/reconnecting" banner after the first successful connect
        if (hasConnectedRef.current) setStatus("error")

        // Exponential backoff capped at 30s
        const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30_000)
        reconnectAttemptRef.current = Math.min(reconnectAttemptRef.current + 1, 10)
        reconnectTimerRef.current = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      cancelledRef.current = true
      clearPing()
      clearReconnect()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [sessionId])

  return {
    status,
    isConnected: status === "connected",
    sendRaw,
    sendMessage,
    sendCommand,
    sendStop,
  }
}
