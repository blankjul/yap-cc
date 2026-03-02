"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { SkillsTab } from "@/components/SkillsTab"

function SkillsContent() {
  const searchParams = useSearchParams()
  const selectedId = searchParams.get("id")
  return <SkillsTab selectedId={selectedId} />
}

export default function SkillsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
          Loading...
        </div>
      }
    >
      <SkillsContent />
    </Suspense>
  )
}
