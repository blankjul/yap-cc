"use client"
import { ReactNode, useEffect, useRef } from "react"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export interface ItemAction {
  label: string
  onClick: () => void
  variant?: "default" | "destructive"
}

export interface ListItem {
  id: string
  label: ReactNode
  sublabel?: string
  icon?: ReactNode
  badge?: ReactNode
  actions?: ItemAction[]
}

interface ItemListProps {
  items: ListItem[]
  selectedId?: string
  onSelect: (id: string) => void
  onDoubleClick?: (id: string) => void
  emptyMessage?: string
  groupLabel?: string
  navLeader?: string
}

export function ItemList({ items, selectedId, onSelect, onDoubleClick, emptyMessage, navLeader = "`" }: ItemListProps) {
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Always-current refs — handler reads these without being in its dep array
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Scroll selected item into view when selection changes
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" })
  }, [selectedId])

  // Nav-leader keyboard handler: ` j/↓ = next, ` k/↑ = prev
  // Registered once (navLeader dep only) so `active` survives re-renders
  // between the ` press and the j/k press.
  useEffect(() => {
    let active = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const clear = () => {
      active = false
      if (timer) { clearTimeout(timer); timer = null }
    }

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return

      if (e.key === navLeader) {
        e.preventDefault()
        active = true
        if (timer) clearTimeout(timer)
        timer = setTimeout(clear, 1000)
        return
      }

      if (!active) return

      const currentItems = itemsRef.current
      if (currentItems.length === 0) { clear(); return }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault()
        clear()
        const idx = currentItems.findIndex((it) => it.id === selectedIdRef.current)
        const next = idx < 0 ? 0 : (idx + 1) % currentItems.length
        onSelectRef.current(currentItems[next].id)
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault()
        clear()
        const idx = currentItems.findIndex((it) => it.id === selectedIdRef.current)
        const prev = idx <= 0 ? currentItems.length - 1 : idx - 1
        onSelectRef.current(currentItems[prev].id)
      } else {
        clear()
      }
    }

    window.addEventListener("keydown", handler)
    return () => { window.removeEventListener("keydown", handler); clear() }
  }, [navLeader]) // only re-register if the leader key itself changes

  if (items.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
        {emptyMessage || "Nothing here yet."}
      </div>
    )
  }

  return (
    <div className="py-1">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "group flex items-center gap-2 px-2 mx-1 rounded-md",
            selectedId === item.id ? "bg-accent" : "hover:bg-accent/50"
          )}
        >
          <button
            ref={selectedId === item.id ? selectedRef : undefined}
            onClick={() => onSelect(item.id)}
            onDoubleClick={() => onDoubleClick?.(item.id)}
            className="flex-1 flex items-center gap-2 py-2 min-w-0 text-left"
          >
            {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{item.label}</p>
              {item.sublabel && (
                <p className="text-xs text-muted-foreground truncate">{item.sublabel}</p>
              )}
            </div>
            {item.badge && <span className="flex-shrink-0">{item.badge}</span>}
          </button>

          {item.actions && item.actions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                {item.actions.map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    onClick={(e) => { e.stopPropagation(); action.onClick() }}
                    className={action.variant === "destructive" ? "text-destructive" : ""}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}
    </div>
  )
}
