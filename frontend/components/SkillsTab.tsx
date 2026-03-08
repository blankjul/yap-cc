"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Zap, FileText } from "lucide-react"
import { toastError } from "@/lib/toast"
import { api } from "@/lib/api"
import type { SkillConfig } from "@/lib/api"
import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout"
import { SidebarPanel } from "@/components/shared/SidebarPanel"
import { ItemList } from "@/components/shared/ItemList"
import type { ListItem } from "@/components/shared/ItemList"
import { EmptyState } from "@/components/shared/EmptyState"
import { DetailPanel } from "@/components/shared/DetailPanel"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

// ── Skill detail type (extends SkillConfig with instructions + files) ──────────

interface SkillDetail extends SkillConfig {
  instructions: string
  files: string[]
}

// ── Main component ─────────────────────────────────────────────────────────────

interface SkillsTabProps {
  selectedId?: string | null
}

export function SkillsTab({ selectedId: initialId }: SkillsTabProps) {
  const router = useRouter()
  const [skills, setSkills] = useState<SkillConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const deleteSkill = async (id: string) => {
    try {
      await api.deleteSkill(id)
      if (selectedId === id) {
        setSelectedId(null)
        setDetail(null)
        router.replace("/skills", { scroll: false })
      }
      await loadSkills()
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete skill")
    }
  }

  // Load skill list
  const loadSkills = async () => {
    try {
      const list = await api.listSkills()
      setSkills(list)
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to load skills")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSkills() }, [])

  // Sync URL param
  useEffect(() => {
    if (initialId) setSelectedId(initialId)
  }, [initialId])

  // Auto-select first skill when none is selected
  useEffect(() => {
    if (loading || selectedId) return
    if (skills.length > 0) {
      const first = skills[0].id
      setSelectedId(first)
      router.replace("/skills?id=" + encodeURIComponent(first), { scroll: false })
    }
  }, [skills, loading, selectedId, router])

  // Load detail when selection changes
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let cancelled = false
    setDetailLoading(true)
    setDetail(null)
    api.getSkill(selectedId)
      .then((d) => { if (!cancelled) setDetail(d) })
      .catch((err) => { if (!cancelled) toastError(err instanceof Error ? err.message : "Failed to load skill") })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])

  // Build list items
  const listItems: ListItem[] = skills.map((s) => ({
    id: s.id,
    label: s.id,
    sublabel: s.description.length > 80 ? s.description.slice(0, 80) + "…" : s.description,
    badge: s.builtin ? (
      <Badge variant="secondary" className="text-[9px] px-1 py-0">
        Built-in
      </Badge>
    ) : undefined,
    actions: s.builtin ? undefined : [
      { label: "Delete", onClick: () => deleteSkill(s.id), variant: "destructive" },
    ],
  }))

  const sidebar = (
    <SidebarPanel
      title="Skills"
      path="~/.yapflows/skills/"
      onRefresh={loadSkills}
      // No create button — skills are read-only from the UI
      createDisabled={true}
      createTooltip="Skills are managed via files"
    >
      {loading ? (
        <div className="space-y-1 p-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : (
        <ItemList
          items={listItems}
          selectedId={selectedId ?? undefined}
          onSelect={(id) => {
            setSelectedId(id)
            router.push("/skills?id=" + encodeURIComponent(id))
          }}
          emptyMessage="No skills found."
        />
      )}
    </SidebarPanel>
  )

  const main = !selectedId ? (
    <EmptyState
      icon={<Zap className="w-10 h-10" />}
      title="No skill selected"
      description="Select a skill from the sidebar to view its details."
    />
  ) : detailLoading ? (
    <div className="p-6 space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-32 w-full" />
    </div>
  ) : detail ? (
    <DetailPanel
      title={
        <div className="flex items-center gap-2">
          <span>{detail.id}</span>
          {detail.builtin ? (
            <Badge variant="secondary">Built-in</Badge>
          ) : (
            <Badge variant="outline">User</Badge>
          )}
        </div>
      }
      subtitle={detail.path}
    >
      <div className="p-6 space-y-6">
        {/* Description */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</p>
          <p className="text-sm">{detail.description}</p>
        </div>

        {/* Arguments */}
        {Object.keys(detail.arguments).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Arguments</p>
            <div className="space-y-1">
              {Object.entries(detail.arguments).map(([name, arg]) => (
                <div key={name} className="flex items-start gap-3 px-3 py-2 rounded-md border border-border text-sm">
                  <span className="font-mono text-xs font-medium shrink-0">{name}</span>
                  <span className="text-muted-foreground text-xs flex-1">{arg.description}</span>
                  {arg.default !== undefined && arg.default !== "" && (
                    <span className="font-mono text-xs text-muted-foreground shrink-0">default: {String(arg.default)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Template */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Template</p>
          <pre className="border border-border rounded-md bg-muted/40 p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[500px]">
            {detail.instructions}
          </pre>
        </div>

        {/* Files */}
        {detail.files.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Files ({detail.files.length})
            </p>
            <div className="space-y-1">
              {detail.files.map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono text-xs">{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DetailPanel>
  ) : (
    <EmptyState
      icon={<Zap className="w-10 h-10" />}
      title="Skill not found"
    />
  )

  return (
    <TwoPaneLayout
      sidebar={sidebar}
      main={main}
      defaultSidebarWidth={260}
      minSidebarWidth={200}
      maxSidebarWidth={400}
    />
  )
}
