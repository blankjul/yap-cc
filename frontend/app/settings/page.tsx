"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { GeneralSettings, EnvironmentsSettings } from "@/components/SettingsTab"
import { SidebarPanel } from "@/components/shared/SidebarPanel"
import { ItemList } from "@/components/shared/ItemList"
import { TwoPaneLayout } from "@/components/shared/TwoPaneLayout"

type Section = "general" | "environments"

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "environments", label: "Environments" },
]

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawSection = searchParams.get("section")
  const section: Section = (["general", "environments"].includes(rawSection ?? "") ? rawSection : "general") as Section

  const setSection = (s: Section) => {
    router.push(`/settings?section=${s}`, { scroll: false })
  }

  const sidebar = (
    <SidebarPanel title="Settings">
      <ItemList
        items={NAV_ITEMS.map((item) => ({ id: item.id, label: item.label }))}
        selectedId={section}
        onSelect={(id) => setSection(id as Section)}
      />
    </SidebarPanel>
  )

  const main = (
    <>
      {section === "general" && <GeneralSettings />}
      {section === "environments" && <EnvironmentsSettings />}
    </>
  )

  return <TwoPaneLayout sidebar={sidebar} main={main} defaultSidebarWidth={200} minSidebarWidth={140} />
}
