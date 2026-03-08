"use client"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback } from "react"

/**
 * Syncs a URL query param (?id= or ?topic=) with list selection.
 * Returns [selectedId, setSelectedId].
 */
export function useSelectedId(paramName: string = "id"): [string | null, (id: string) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const selectedId = searchParams.get(paramName)

  const setSelectedId = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(paramName, id)
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams, paramName]
  )

  return [selectedId, setSelectedId]
}
