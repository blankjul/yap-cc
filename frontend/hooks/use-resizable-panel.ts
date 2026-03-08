"use client"
import { useCallback, useEffect, useRef, useState } from "react"

interface UseResizablePanelOptions {
  defaultWidth: number
  minWidth: number
  maxWidth: number
  storageKey?: string
}

export function useResizablePanel({
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
}: UseResizablePanelOptions) {
  const [width, setWidth] = useState(defaultWidth)

  useEffect(() => {
    if (!storageKey) return
    const stored = localStorage.getItem(storageKey)
    if (stored) setWidth(parseInt(stored, 10))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const startResize = useCallback((e: React.MouseEvent) => {
    isResizing.current = true
    startX.current = e.clientX
    startWidth.current = width
    e.preventDefault()
  }, [width])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta))
      setWidth(newWidth)
      if (storageKey) {
        localStorage.setItem(storageKey, String(newWidth))
      }
    }

    const onMouseUp = () => {
      isResizing.current = false
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [minWidth, maxWidth, storageKey])

  return { width, startResize }
}
