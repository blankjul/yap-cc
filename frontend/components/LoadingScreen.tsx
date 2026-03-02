"use client"

import { motion } from "motion/react"

interface LoadingScreenProps {
  error?: string
}

export function LoadingScreen({ error }: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-zinc-950 z-50">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col items-center gap-6"
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl font-bold tracking-tight text-zinc-100">yapflows</span>
          {!error && (
            <div className="flex items-center gap-1.5 mt-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block size-2 rounded-full bg-zinc-400 animate-bounce"
                  style={{ animationDelay: `${i * 200}ms`, animationDuration: "1s" }}
                />
              ))}
            </div>
          )}
        </div>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="text-sm text-red-400 text-center max-w-xs"
          >
            {error}
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}
