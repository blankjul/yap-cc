"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { BrainCircuit } from "lucide-react"
import { api } from "@/lib/api"
import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout"
import { SidebarPanel } from "@/components/shared/SidebarPanel"
import { ItemList } from "@/components/shared/ItemList"
import { MarkdownEditor } from "@/components/shared/MarkdownEditor"
import { EmptyState } from "@/components/shared/EmptyState"
import { DetailPanel } from "@/components/shared/DetailPanel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

interface MemoryTopic {
  id: string
  name: string
  description?: string
}

function MemoryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get("id")

  const [topics, setTopics] = useState<MemoryTopic[]>([])
  const [content, setContent] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [filePath, setFilePath] = useState<string | undefined>()
  const [updatedAt, setUpdatedAt] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const newInputRef = useRef<HTMLInputElement>(null)

  const setSelectedId = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("id", id)
    router.push(`/memory?${params.toString()}`, { scroll: false })
  }

  const loadTopics = async () => {
    setLoading(true)
    try {
      const list = await api.listMemory()
      // Sort so "default" is always first
      const sorted = [...list].sort((a, b) => {
        if (a.id === "default") return -1
        if (b.id === "default") return 1
        return a.id.localeCompare(b.id)
      })
      setTopics(sorted)
      if (!selectedId && sorted.length > 0) {
        setSelectedId(sorted[0].id)
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to load memory")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTopics() }, [])

  const loadTopic = (id: string) => {
    let cancelled = false
    api.getMemory(id)
      .then((d) => {
        if (!cancelled) {
          setContent(d.content)
          setOriginalContent(d.content)
          setFilePath(d.file_path)
          setUpdatedAt(d.updated_at)
        }
      })
      .catch((err) => {
        if (!cancelled) toastError(err instanceof Error ? err.message : "Failed to load topic")
      })
    return () => { cancelled = true }
  }

  useEffect(() => {
    if (!selectedId) {
      setContent("")
      setOriginalContent("")
      setFilePath(undefined)
      setUpdatedAt(undefined)
      return
    }
    return loadTopic(selectedId)
  }, [selectedId])

  const startCreating = () => {
    setCreating(true)
    setNewName("")
    setTimeout(() => newInputRef.current?.focus(), 0)
  }

  const commitCreate = async () => {
    const name = newName.trim()
    setCreating(false)
    setNewName("")
    if (!name) return
    try {
      const created = await api.createMemory(name)
      await loadTopics()
      setSelectedId(created.id)
      toast.success(`Topic "${name}" created`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create topic")
    }
  }

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      const result = await api.saveMemory(selectedId, content)
      setOriginalContent(content)
      setUpdatedAt(result.updated_at)
      toast.success("Saved")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const isDirty = content !== originalContent

  const handleDelete = async (id: string) => {
    if (id === "default") return
    try {
      await api.deleteMemory(id)
      const remaining = topics.filter((t) => t.id !== id)
      setTopics(remaining)
      if (selectedId === id) {
        if (remaining.length > 0) {
          setSelectedId(remaining[0].id)
        } else {
          router.push("/memory", { scroll: false })
          setContent("")
        }
      }
      toast.success("Topic deleted")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete topic")
    }
  }

  const items = topics.map((topic) => ({
    id: topic.id,
    label: topic.id,
    sublabel: topic.description || undefined,
    actions:
      topic.id === "default"
        ? []
        : [
            {
              label: "Delete",
              onClick: () => handleDelete(topic.id),
              variant: "destructive" as const,
            },
          ],
  }))

  const sidebar = (
    <SidebarPanel
      title="Memory"
      path="~/.yapflows/memory/"
      onRefresh={loadTopics}
      onCreate={startCreating}
    >
      {loading ? (
        <div className="space-y-1 p-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : (
        <>
          {creating && (
            <div className="px-2 pt-2">
              <Input
                ref={newInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={commitCreate}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitCreate()
                  if (e.key === "Escape") { setCreating(false); setNewName("") }
                }}
                placeholder="topic-name"
                className="h-8 text-sm"
              />
            </div>
          )}
          <ItemList
            items={items}
            selectedId={selectedId ?? undefined}
            onSelect={setSelectedId}
            emptyMessage="No topics yet."
          />
        </>
      )}
    </SidebarPanel>
  )

  const main =
    !selectedId ? (
      <EmptyState
        icon={<BrainCircuit className="w-10 h-10" />}
        title="No topic selected"
        description="Select a memory topic from the list or create a new one."
      />
    ) : (
      <DetailPanel
        title={selectedId}
        subtitle={selectedId === "default" ? "Always loaded as context for every session" : undefined}
        actions={
          <Button size="sm" onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      >
        <div className="flex flex-col h-full p-4">
          <MarkdownEditor
            key={selectedId}
            value={content}
            onChange={setContent}
            onReload={() => selectedId && loadTopic(selectedId)}
            placeholder="Write memory content here..."
            filePath={filePath}
            updatedAt={updatedAt}
            className="flex-1"
          />
        </div>
      </DetailPanel>
    )

  return (
    <TwoPaneLayout
      sidebar={sidebar}
      main={main}
      defaultSidebarWidth={260}
    />
  )
}

export function MemoryTab() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground text-sm">Loading...</div>}>
      <MemoryContent />
    </Suspense>
  )
}
