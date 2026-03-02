"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { BookOpen } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
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

interface KnowledgeItem {
  id: string
  name: string
  updated_at: number
  description?: string
}

interface KnowledgeDetail {
  id: string
  content: string
  updated_at: number
  file_path: string
}

function KnowledgeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get("id")

  const [docs, setDocs] = useState<KnowledgeItem[]>([])
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null)
  const [content, setContent] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const newInputRef = useRef<HTMLInputElement>(null)

  const setSelectedId = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("id", id)
    router.push(`/knowledge?${params.toString()}`, { scroll: false })
  }

  const loadDocs = async () => {
    setLoading(true)
    try {
      const list = await api.listKnowledge()
      setDocs(list)
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to load knowledge")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadDocs() }, [])

  const loadDoc = (id: string) => {
    let cancelled = false
    api.getKnowledge(id)
      .then((d) => {
        if (!cancelled) {
          setDetail(d)
          setContent(d.content)
          setOriginalContent(d.content)
        }
      })
      .catch((err) => {
        if (!cancelled) toastError(err instanceof Error ? err.message : "Failed to load document")
      })
    return () => { cancelled = true }
  }

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setContent("")
      setOriginalContent("")
      return
    }
    return loadDoc(selectedId)
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
      const created = await api.createKnowledge(name)
      await loadDocs()
      setSelectedId(created.id)
      toast.success(`Document "${name}" created`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create document")
    }
  }

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      const result = await api.saveKnowledge(selectedId, content)
      setOriginalContent(content)
      setDetail((prev) => prev ? { ...prev, updated_at: result.updated_at } : prev)
      setDocs((prev) =>
        prev.map((d) => (d.id === selectedId ? { ...d, updated_at: result.updated_at } : d))
      )
      toast.success("Saved")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const isDirty = content !== originalContent

  const handleDelete = async (id: string) => {
    try {
      await api.deleteKnowledge(id)
      const remaining = docs.filter((d) => d.id !== id)
      setDocs(remaining)
      if (selectedId === id) {
        if (remaining.length > 0) {
          setSelectedId(remaining[0].id)
        } else {
          router.push("/knowledge", { scroll: false })
          setDetail(null)
          setContent("")
        }
      }
      toast.success("Document deleted")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete")
    }
  }

  const items = docs.map((doc) => ({
    id: doc.id,
    label: doc.id,
    sublabel: doc.description || undefined,
    actions: [
      {
        label: "Delete",
        onClick: () => handleDelete(doc.id),
        variant: "destructive" as const,
      },
    ],
  }))

  const sidebar = (
    <SidebarPanel
      title="Knowledge"
      path="~/.yapflows/knowledge/"
      onRefresh={loadDocs}
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
                placeholder="document-name"
                className="h-8 text-sm"
              />
            </div>
          )}
          <ItemList
            items={items}
            selectedId={selectedId ?? undefined}
            onSelect={setSelectedId}
            emptyMessage="No documents yet."
          />
        </>
      )}
    </SidebarPanel>
  )

  const currentDoc = docs.find((d) => d.id === selectedId)

  const main =
    !selectedId || !detail ? (
      <EmptyState
        icon={<BookOpen className="w-10 h-10" />}
        title="No document selected"
        description="Select a document from the list or create a new one."
      />
    ) : (
      <DetailPanel
        title={currentDoc?.id ?? selectedId}
        subtitle={
          detail.updated_at
            ? `Updated ${formatDistanceToNow(new Date(detail.updated_at * 1000), { addSuffix: true })}`
            : undefined
        }
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
            onReload={() => selectedId && loadDoc(selectedId)}
            placeholder="Write markdown content here..."
            filePath={detail.file_path}
            updatedAt={detail.updated_at}
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

export function KnowledgeTab() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground text-sm">Loading...</div>}>
      <KnowledgeContent />
    </Suspense>
  )
}
