"use client"
import { cn } from "@/lib/utils"
import { useResizablePanel } from "@/hooks/use-resizable-panel"

interface TwoPanelLayoutProps {
  sidebar: React.ReactNode
  main: React.ReactNode
  defaultSidebarWidth?: number
  minSidebarWidth?: number
  maxSidebarWidth?: number
  sidebarCollapsed?: boolean
}

export function TwoPaneLayout({
  sidebar,
  main,
  defaultSidebarWidth = 280,
  minSidebarWidth = 180,
  maxSidebarWidth = 480,
  sidebarCollapsed = false,
}: TwoPanelLayoutProps) {
  const { width, startResize } = useResizablePanel({
    defaultWidth: defaultSidebarWidth,
    minWidth: minSidebarWidth,
    maxWidth: maxSidebarWidth,
    storageKey: "yapflows-sidebar-width",
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div
        className={cn(
          "flex-shrink-0 border-r border-border overflow-hidden transition-all duration-200",
          sidebarCollapsed ? "w-0" : ""
        )}
        style={!sidebarCollapsed ? { width } : undefined}
      >
        <div className="h-full overflow-y-auto" style={{ width: sidebarCollapsed ? 0 : width }}>
          {sidebar}
        </div>
      </div>

      {/* Resize handle */}
      {!sidebarCollapsed && (
        <div
          className="w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors flex-shrink-0"
          onMouseDown={startResize}
        />
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {main}
      </div>
    </div>
  )
}
