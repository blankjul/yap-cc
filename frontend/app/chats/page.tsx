"use client"

import { Suspense, Component, type ReactNode } from "react"

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return <div className="p-8 text-red-400 text-sm font-mono whitespace-pre-wrap">{String(this.state.error)}{"\n"}{(this.state.error as Error).stack}</div>
    }
    return this.props.children
  }
}

import { useSearchParams } from "next/navigation"
import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout"
import { SessionPanel } from "@/components/SessionPanel"
import { ChatInterface } from "@/components/ChatInterface"
import { EmptyState } from "@/components/shared/EmptyState"
import { MessageSquare } from "lucide-react"

function ChatsContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("id")

  return (
    <TwoPaneLayout
      sidebar={<SessionPanel />}
      main={
        sessionId ? (
          <ChatInterface key={sessionId} sessionId={sessionId} />
        ) : (
          <EmptyState
            icon={<MessageSquare className="w-10 h-10" />}
            title="No chat selected"
            description="Select a chat from the sidebar or create a new one."
          />
        )
      }
      defaultSidebarWidth={240}
      minSidebarWidth={180}
      maxSidebarWidth={400}
    />
  )
}

export default function ChatsPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground text-sm">Loading...</div>}>
        <ChatsContent />
      </Suspense>
    </ErrorBoundary>
  )
}
