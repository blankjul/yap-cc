"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import type { BrowserStatus } from "@/lib/types"

export function useBrowserStatus() {
  const [status, setStatus] = useState<BrowserStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let interval: NodeJS.Timeout

    const fetchStatus = async () => {
      try {
        const data = await api.getBrowserStatus()
        if (mounted) {
          setStatus(data)
          setError(null)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    // Initial fetch
    fetchStatus()

    // Poll every 3 seconds
    interval = setInterval(fetchStatus, 3000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return {
    status,
    isLoading,
    error,
    isActive: status?.vnc_active ?? false,
    vncUrl: status?.vnc_url ?? null,
  }
}
