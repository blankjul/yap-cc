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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
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
