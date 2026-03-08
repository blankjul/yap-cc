import { useState, useCallback } from "react"
import type { EnvironmentConfig } from "@/lib/api"
import { STORAGE_KEYS } from "@/lib/storage-keys"

const LAST_ENV_KEY = STORAGE_KEYS.LAST_ENVIRONMENT

export function useDefaultEnvironment(environments: EnvironmentConfig[]) {
  const resolve = (list: EnvironmentConfig[]): string => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(LAST_ENV_KEY) : null
    return list.find((e) => e.id === stored)?.id ?? list[0]?.id ?? ""
  }

  const [environmentId, setEnvironmentId] = useState<string>(() => resolve(environments))

  // Re-resolve when environments list changes (e.g. after async load)
  const [prevEnvironments, setPrevEnvironments] = useState(environments)
  if (environments !== prevEnvironments) {
    setPrevEnvironments(environments)
    const resolved = resolve(environments)
    if (resolved !== environmentId) {
      setEnvironmentId(resolved)
    }
  }

  const environment = environments.find((e) => e.id === environmentId) ?? null

  const setDefault = useCallback((id: string) => {
    setEnvironmentId(id)
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_ENV_KEY, id)
    }
  }, [])

  return { environmentId, environment, setDefault }
}
