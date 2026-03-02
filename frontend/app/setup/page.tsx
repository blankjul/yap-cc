"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"

type ProviderTestResult = { ok: boolean; error?: string } | null

interface FormState {
  name: string
  what_you_do: string
  timezone: string
  preferences: string
  default_model: string
  default_provider_id: "claude-cli" | "openrouter"
}

const MODEL_OPTIONS: { provider_id: "claude-cli" | "openrouter"; value: string; label: string; sublabel: string }[] = [
  { provider_id: "claude-cli", value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", sublabel: "Fast & efficient · Claude CLI" },
  { provider_id: "claude-cli", value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", sublabel: "Balanced · Claude CLI" },
  { provider_id: "claude-cli", value: "claude-opus-4-6", label: "Claude Opus 4.6", sublabel: "Most capable · Claude CLI" },
  { provider_id: "openrouter", value: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", sublabel: "Fast & efficient · OpenRouter" },
  { provider_id: "openrouter", value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", sublabel: "Balanced · OpenRouter" },
  { provider_id: "openrouter", value: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6", sublabel: "Most capable · OpenRouter" },
]

interface ProviderResults {
  claudeCli: ProviderTestResult
  openrouter: ProviderTestResult
}

// Step indicator component
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i + 1 === current
              ? "w-6 bg-primary"
              : i + 1 < current
              ? "w-2 bg-primary/60"
              : "w-2 bg-muted"
          }`}
        />
      ))}
      <span className="ml-2 text-sm text-muted-foreground">
        Step {current} of {total}
      </span>
    </div>
  )
}

// Step 1: Welcome
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Welcome to Yapflows</h1>
        <p className="text-lg text-muted-foreground max-w-md">
          Your personal AI assistant. Let&apos;s get you set up in a few steps.
        </p>
      </div>
      <Button size="lg" onClick={onNext} className="mt-4">
        Get started &rarr;
      </Button>
    </div>
  )
}

// Step 2: Providers
function StepProviders({
  results,
  onResults,
  onNext,
  onBack,
}: {
  results: ProviderResults
  onResults: (r: ProviderResults) => void
  onNext: () => void
  onBack: () => void
}) {
  const [openrouterKey, setOpenrouterKey] = useState("")
  const [testingCli, setTestingCli] = useState(false)
  const [testingOpenrouter, setTestingOpenrouter] = useState(false)

  async function handleTestCli() {
    setTestingCli(true)
    try {
      const result = await api.testProvider({ provider_id: "claude-cli" })
      onResults({ ...results, claudeCli: result })
    } catch (e) {
      onResults({ ...results, claudeCli: { ok: false, error: String(e) } })
    } finally {
      setTestingCli(false)
    }
  }

  async function handleTestOpenrouter() {
    setTestingOpenrouter(true)
    try {
      const result = await api.testProvider({
        provider_id: "openrouter",
        api_key: openrouterKey,
      })
      onResults({ ...results, openrouter: result })
    } catch (e) {
      onResults({ ...results, openrouter: { ok: false, error: String(e) } })
    } finally {
      setTestingOpenrouter(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-lg">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Configure Providers</h2>
        <p className="text-muted-foreground">
          Yapflows supports Claude CLI (local) and OpenRouter (cloud).
        </p>
      </div>

      {/* Claude CLI */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Claude CLI</h3>
          {results.claudeCli && (
            <span
              className={`text-sm font-medium ${
                results.claudeCli.ok ? "text-green-500" : "text-destructive"
              }`}
            >
              {results.claudeCli.ok ? "Working" : "Failed"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Claude CLI runs Claude models locally on your machine. It must be installed and
          authenticated.
        </p>
        {results.claudeCli && !results.claudeCli.ok && results.claudeCli.error && (
          <p className="text-sm text-destructive">{results.claudeCli.error}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestCli}
          disabled={testingCli}
        >
          {testingCli ? "Testing..." : "Test Claude CLI"}
        </Button>
      </div>

      {/* OpenRouter */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">OpenRouter</h3>
          {results.openrouter && (
            <span
              className={`text-sm font-medium ${
                results.openrouter.ok ? "text-green-500" : "text-destructive"
              }`}
            >
              {results.openrouter.ok ? "Working" : "Failed"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          OpenRouter gives access to many AI models via a single API.
        </p>
        <Input
          type="password"
          placeholder="sk-or-..."
          value={openrouterKey}
          onChange={(e) => setOpenrouterKey(e.target.value)}
        />
        {results.openrouter && !results.openrouter.ok && results.openrouter.error && (
          <p className="text-sm text-destructive">{results.openrouter.error}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestOpenrouter}
          disabled={testingOpenrouter || !openrouterKey}
        >
          {testingOpenrouter ? "Testing..." : "Test connection"}
        </Button>
        <p className="text-xs text-muted-foreground">
          At least one provider must work to use Yapflows.
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Continue &rarr;</Button>
      </div>
    </div>
  )
}

// Step 3: Default Model
function StepModel({
  form,
  onChange,
  providerResults,
  onNext,
  onBack,
}: {
  form: FormState
  onChange: (f: FormState) => void
  providerResults: ProviderResults
  onNext: () => void
  onBack: () => void
}) {
  const providers: { id: "claude-cli" | "openrouter"; label: string; description: string }[] = [
    { id: "claude-cli", label: "Claude CLI", description: "Runs locally on your machine" },
    { id: "openrouter", label: "OpenRouter", description: "Cloud API, many models" },
  ]
  const testedProviders = {
    "claude-cli": providerResults.claudeCli,
    "openrouter": providerResults.openrouter,
  }

  const modelsForProvider = MODEL_OPTIONS.filter((m) => m.provider_id === form.default_provider_id)

  const handleProviderChange = (id: "claude-cli" | "openrouter") => {
    const firstModel = MODEL_OPTIONS.find((m) => m.provider_id === id)
    onChange({ ...form, default_provider_id: id, default_model: firstModel?.value ?? "" })
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-lg">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Choose your default model</h2>
        <p className="text-muted-foreground">
          This will be used by your default assistant agent.
        </p>
      </div>

      {/* Provider selection */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Provider</p>
        <div className="grid grid-cols-2 gap-3">
          {providers.map((p) => {
            const result = testedProviders[p.id]
            const active = form.default_provider_id === p.id
            return (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="font-medium text-sm">{p.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                {result && (
                  <div className={`text-xs mt-1 font-medium ${result.ok ? "text-green-500" : "text-destructive"}`}>
                    {result.ok ? "tested ✓" : "failed"}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Model selection */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Model</p>
        {modelsForProvider.map((opt) => {
          const selected = form.default_model === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onChange({ ...form, default_model: opt.value })}
              className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <div className="font-medium text-sm">{opt.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{opt.sublabel.split(" · ")[0]}</div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={!form.default_model}>Continue &rarr;</Button>
      </div>
    </div>
  )
}

// Step 4: About You
function StepAboutYou({
  form,
  onChange,
  onNext,
  onBack,
}: {
  form: FormState
  onChange: (f: FormState) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="flex flex-col gap-6 w-full max-w-lg">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Tell us about yourself</h2>
        <p className="text-muted-foreground">
          This helps your assistant give you more relevant and personalised responses.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Your name</label>
          <Input
            placeholder="e.g. Alex"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">What you do</label>
          <textarea
            className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            rows={3}
            placeholder="e.g. Software engineer working on web apps"
            value={form.what_you_do}
            onChange={(e) => onChange({ ...form, what_you_do: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Timezone</label>
          <Input
            placeholder="e.g. Europe/Berlin"
            value={form.timezone}
            onChange={(e) => onChange({ ...form, timezone: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Preferences &amp; interests</label>
          <textarea
            className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            rows={4}
            placeholder="Anything you want the assistant to know about you..."
            value={form.preferences}
            onChange={(e) => onChange({ ...form, preferences: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Continue &rarr;</Button>
      </div>
    </div>
  )
}

// Step 5: Done
function StepDone({
  form,
  providerResults,
  onBack,
}: {
  form: FormState
  providerResults: ProviderResults
  onBack: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workingProviders = [
    providerResults.claudeCli?.ok && "Claude CLI",
    providerResults.openrouter?.ok && "OpenRouter",
  ].filter(Boolean) as string[]

  async function handleStart() {
    setLoading(true)
    setError(null)
    try {
      await api.completeSetup({
        name: form.name || null,
        timezone: form.timezone || null,
        what_you_do: form.what_you_do || null,
        preferences: form.preferences || null,
        default_model: form.default_model || null,
        default_provider_id: form.default_provider_id || null,
      })
      router.push("/")
    } catch (e) {
      setError(String(e))
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center text-center gap-6 w-full max-w-lg">
      <div className="space-y-3">
        <div className="text-5xl mb-2">*</div>
        <h2 className="text-3xl font-bold">You&apos;re all set!</h2>
        <p className="text-muted-foreground">Here&apos;s a summary of what was configured.</p>
      </div>

      <div className="w-full rounded-lg border bg-card p-5 text-left space-y-3">
        {form.name && (
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground w-28 shrink-0">Name</span>
            <span>{form.name}</span>
          </div>
        )}
        {form.timezone && (
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground w-28 shrink-0">Timezone</span>
            <span>{form.timezone}</span>
          </div>
        )}
        {form.what_you_do && (
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground w-28 shrink-0">Role</span>
            <span>{form.what_you_do}</span>
          </div>
        )}
        {form.default_model && (
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground w-28 shrink-0">Model</span>
            <span className="font-mono text-xs">{form.default_model}</span>
          </div>
        )}
        <div className="flex gap-2 text-sm">
          <span className="text-muted-foreground w-28 shrink-0">Providers</span>
          <span>
            {workingProviders.length > 0
              ? workingProviders.join(", ")
              : "None tested (can configure later)"}
          </span>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button size="lg" onClick={handleStart} disabled={loading}>
          {loading ? "Saving..." : "Start chatting \u2192"}
        </Button>
      </div>
    </div>
  )
}

// Main page
export default function SetupPage() {
  const [step, setStep] = useState(1)
  const [providerResults, setProviderResults] = useState<ProviderResults>({
    claudeCli: null,
    openrouter: null,
  })
  const [form, setForm] = useState<FormState>(() => ({
    name: "",
    what_you_do: "",
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "",
    preferences: "",
    default_model: "claude-haiku-4-5-20251001",
    default_provider_id: "claude-cli",
  }))

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg">
        <StepIndicator current={step} total={5} />

        {step === 1 && <StepWelcome onNext={() => setStep(2)} />}

        {step === 2 && (
          <StepProviders
            results={providerResults}
            onResults={setProviderResults}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <StepModel
            form={form}
            onChange={setForm}
            providerResults={providerResults}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <StepAboutYou
            form={form}
            onChange={setForm}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}

        {step === 5 && (
          <StepDone
            form={form}
            providerResults={providerResults}
            onBack={() => setStep(4)}
          />
        )}
      </div>
    </div>
  )
}
