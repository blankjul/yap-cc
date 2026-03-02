"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "motion/react"
import { Shell } from "@/components/Shell"
import { LoadingScreen } from "@/components/LoadingScreen"
const API_BASE_URL = "http://localhost:8000"

const TIMEOUT_MS = 5000
const MIN_LOADING_MS = 600

export function ShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")

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
        {state !== "ready" && (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <LoadingScreen error={state === "error" ? errorMsg : undefined} />
          </motion.div>
        )}
      </AnimatePresence>
      {state === "ready" && <Shell>{children}</Shell>}
    </>
  )
}
