"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { TasksTab } from "@/components/TasksTab"

function TasksContent() {
  const searchParams = useSearchParams()
  const selectedName = searchParams.get("id")
  return <TasksTab selectedName={selectedName} />
}

export default function TasksPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
          Loading...
        </div>
      }
    >
      <TasksContent />
    </Suspense>
  )
}
