"use client"

import { useRef, useState } from "react"
import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { CopyIcon, CheckIcon } from "lucide-react"

function CodeBlock({ children }: { children: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const codeEl = React.Children.toArray(children)[0] as React.ReactElement<{ className?: string }> | undefined
  const lang = codeEl?.props?.className?.replace("language-", "") ?? ""

  const handleCopy = () => {
    const text = preRef.current?.textContent ?? ""
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="my-3 rounded-lg border border-zinc-700/60 bg-zinc-900 dark:bg-zinc-950 overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700/60 bg-zinc-800/60">
        <span className="font-mono text-zinc-400 text-[11px]">{lang || "code"}</span>
        <button
          onClick={handleCopy}
          title="Copy code"
          className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          {copied ? (
            <><CheckIcon className="size-3" /><span className="text-[11px]">Copied</span></>
          ) : (
            <><CopyIcon className="size-3" /><span className="text-[11px]">Copy</span></>
          )}
        </button>
      </div>
      <pre ref={preRef} className="overflow-x-auto p-3 leading-relaxed m-0 bg-transparent">
        {children}
      </pre>
    </div>
  )
}

interface MarkdownContentProps {
  content: string
  showCursor?: boolean
}

export function MarkdownContent({ content, showCursor }: MarkdownContentProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ className, children, ...props }) => {
            const isBlock = className?.startsWith("language-")
            if (isBlock) {
              return <code className={className} {...props}>{children}</code>
            }
            return (
              <code
                {...props}
                className="bg-zinc-800/70 text-zinc-200 rounded px-1 py-0.5 text-[0.85em] font-mono"
              >
                {children}
              </code>
            )
          },
          table: ({ ...props }) => (
            <div className="overflow-x-auto my-2">
              <table {...props} className="text-xs border-collapse w-full" />
            </div>
          ),
          th: ({ ...props }) => (
            <th {...props} className="border border-zinc-700 px-3 py-1.5 bg-zinc-800/50 text-left font-semibold" />
          ),
          td: ({ ...props }) => (
            <td {...props} className="border border-zinc-700 px-3 py-1.5" />
          ),
        }}
      >
        {showCursor ? content + "\u200B" : content}
      </ReactMarkdown>
      {showCursor && (
        <span className="inline-block w-1.5 h-3.5 bg-current opacity-70 ml-0.5 animate-pulse rounded-sm align-middle" />
      )}
    </div>
  )
}
