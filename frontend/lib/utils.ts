import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract a short description from markdown content.
 * Checks YAML frontmatter for a `description:` field first, then falls back
 * to the first non-empty, non-heading line after frontmatter. */
export function parseDescription(content: string, maxLen = 80): string {
  if (content.startsWith("---")) {
    const end = content.indexOf("\n---", 3)
    if (end !== -1) {
      const fm = content.slice(3, end)
      const m = fm.match(/^description:\s*(.+)$/m)
      if (m) {
        const desc = m[1].trim().replace(/^['"]|['"]$/g, "")
        return desc.length > maxLen ? desc.slice(0, maxLen) + "…" : desc
      }
    }
  }
  // Fallback: first non-empty, non-heading line after frontmatter
  const lines = content.split("\n")
  let start = 0
  if (content.startsWith("---")) {
    const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---")
    if (endIdx !== -1) start = endIdx + 1
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line && !line.startsWith("#")) {
      return line.length > maxLen ? line.slice(0, maxLen) + "…" : line
    }
  }
  return ""
}

export function agentInitials(id: string): string {
  return id
    .split(/[-_\s]+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("")
}
