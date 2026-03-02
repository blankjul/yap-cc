"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Home,
  MessageSquare,
  Bot,
  BookOpen,
  Brain,
  Clock,
  Zap,
  Settings,
  Moon,
  Sun,
  PanelLeft,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { NavIcon } from "@/components/NavIcon"
import { HotkeysTab } from "@/components/HotkeysTab"
import { api } from "@/lib/api"
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts"
import { cn } from "@/lib/utils"

type SectionKey = "/" | "/chats" | "/agents" | "/knowledge" | "/memory" | "/tasks" | "/skills" | "/settings"

const NAV_SECTIONS: Array<{
  path: SectionKey
  icon: LucideIcon
  label: string
  shortcut: string
}> = [
  { path: "/",          icon: Home,         label: "Home",      shortcut: "1" },
  { path: "/chats",     icon: MessageSquare, label: "Chats",    shortcut: "2" },
  { path: "/agents",    icon: Bot,           label: "Agents",   shortcut: "3" },
  { path: "/knowledge", icon: BookOpen,      label: "Knowledge",shortcut: "4" },
  { path: "/memory",    icon: Brain,         label: "Memory",   shortcut: "5" },
  { path: "/tasks",     icon: Clock,         label: "Tasks",    shortcut: "6" },
  { path: "/skills",    icon: Zap,           label: "Skills",   shortcut: "7" },
]

function getActiveSection(pathname: string): SectionKey {
  if (pathname.startsWith("/chats"))     return "/chats"
  if (pathname.startsWith("/agents"))    return "/agents"
  if (pathname.startsWith("/knowledge")) return "/knowledge"
  if (pathname.startsWith("/memory"))    return "/memory"
  if (pathname.startsWith("/tasks"))     return "/tasks"
  if (pathname.startsWith("/skills"))    return "/skills"
  if (pathname.startsWith("/settings"))  return "/settings"
  return "/"
}

const STORAGE_KEY = "sidebar-wide"

function ShellContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const activeSection = getActiveSection(pathname)
  const leaderKeyRef = useRef("\\")
  const [hotkeysOpen, setHotkeysOpen] = useState(false)
  const [sidebarWide, setSidebarWide] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  )

  const toggleSidebar = () =>
    setSidebarWide((v) => {
      localStorage.setItem(STORAGE_KEY, String(!v))
      return !v
    })

  // Check setup status on mount
  useEffect(() => {
    api.setupStatus()
      .then((s) => { if (s.required) router.push("/setup") })
      .catch(() => {})
  }, [router])

  useKeyboardShortcuts(
    {
      "t": toggleSidebar,
      "1": "/",
      "2": "/chats",
      "3": "/agents",
      "4": "/knowledge",
      "5": "/memory",
      "6": "/tasks",
      "7": "/skills",
      ",": "/settings",
      "k": () => setHotkeysOpen(true),
    },
    leaderKeyRef
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>

      {/* Nav rail on the right */}
      <nav
        className={cn(
          "border-l border-border flex flex-col py-3 shrink-0 gap-1 overflow-hidden",
          "transition-[width] duration-200",
          sidebarWide ? "w-44 px-2" : "w-12 items-center"
        )}
      >
        {/* Toggle button */}
        <NavIcon
          icon={PanelLeft}
          label="Toggle"
          shortcut="t"
          wide={sidebarWide}
          leaderKey={leaderKeyRef.current}
          onClick={toggleSidebar}
        />

        <div className={cn("my-1 shrink-0 bg-border", sidebarWide ? "h-px mx-1" : "h-px w-6")} />

        {/* Main nav items */}
        {NAV_SECTIONS.map((section) => (
          <NavIcon
            key={section.path}
            icon={section.icon}
            label={section.label}
            shortcut={section.shortcut}
            active={activeSection === section.path}
            wide={sidebarWide}
            leaderKey={leaderKeyRef.current}
            onClick={() => router.push(section.path)}
          />
        ))}

        <div className="flex-1" />

        {/* Settings */}
        <NavIcon
          icon={Settings}
          label="Settings"
          shortcut=","
          active={activeSection === "/settings"}
          wide={sidebarWide}
          leaderKey={leaderKeyRef.current}
          onClick={() => router.push("/settings")}
        />

        {/* Theme toggle */}
        <NavIcon
          icon={theme === "dark" ? Sun : Moon}
          label={theme === "dark" ? "Light mode" : "Dark mode"}
          wide={sidebarWide}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        />
      </nav>

      {/* Keyboard shortcuts overlay */}
      <HotkeysTab open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
    </div>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">
        Loading...
      </div>
    }>
      <ShellContent>{children}</ShellContent>
    </Suspense>
  )
}
