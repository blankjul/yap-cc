import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { ShellWrapper } from "@/components/ShellWrapper"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

export const metadata: Metadata = {
  title: "Yapflows",
  description: "Personal AI assistant",
}

async function getAccent(): Promise<string> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL || "http://localhost:8000"}/api/settings`,
      { cache: "no-store" }
    )
    const data = await res.json()
    return data?.ui?.theme_color || "zinc"
  } catch {
    return "zinc"
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const accent = await getAccent()
  return (
    <html lang="en" suppressHydrationWarning data-accent={accent}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider delayDuration={400}>
            <ShellWrapper>{children}</ShellWrapper>
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
