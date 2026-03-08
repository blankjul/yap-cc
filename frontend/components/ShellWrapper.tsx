"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "motion/react"
import { Shell } from "@/components/Shell"
import { LoadingScreen } from "@/components/LoadingScreen"
import { AlertTriangle, X } from "lucide-react"

const API_BASE_URL = ""
const TIMEOUT_MS = 5000
const MIN_LOADING_MS = 600

export function ShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [errorOpen, setErrorOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) {
        setState("error")
        setErrorMsg("Backend not reachable. Make sure the Yapflows server is running on port 8000.")
      }
    }, TIMEOUT_MS)

    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, MIN_LOADING_MS))
    const healthCheck = fetch(`${API_BASE_URL}/health`)
      .then((r) =>
        r.ok
          ? ({ ok: true } as const)
          : ({ ok: false, msg: `Backend returned ${r.status}. Check server logs.` } as const)
      )
      .catch(() => ({ ok: false, msg: "Cannot connect to backend. Make sure the Yapflows server is running." } as const))

    Promise.all([minDelay, healthCheck]).then(([, result]) => {
      if (cancelled) return
      clearTimeout(timer)
      if (result.ok) {
        setState("ready")
      } else {
        setState("error")
        setErrorMsg(result.msg)
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  if (pathname.startsWith("/setup")) return <>{children}</>

  return (
    <>
      <AnimatePresence>
        {state === "loading" && (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <LoadingScreen />
          </motion.div>
        )}
      </AnimatePresence>

      {state === "error" && (
        <>
          <Shell>{children}</Shell>
          {/* Error button top-right */}
          <button
            onClick={() => setErrorOpen(true)}
            className="fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-md bg-red-950/80 border border-red-800 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-900/80 transition-colors backdrop-blur-sm"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Backend error
          </button>

          {/* Error detail modal */}
          {errorOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setErrorOpen(false)}>
              <div className="relative bg-zinc-900 border border-red-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Backend unreachable
                  </span>
                  <button onClick={() => setErrorOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-zinc-300 font-mono whitespace-pre-wrap">{errorMsg}</p>
              </div>
            </div>
          )}
        </>
      )}

      {state === "ready" && <Shell>{children}</Shell>}
    </>
  )
}
