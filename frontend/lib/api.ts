const BASE = "http://localhost:8000"

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

export const api = {
  // Setup
  setupStatus: () => req<{ required: boolean }>("GET", "/setup/status"),
  testProvider: (body: { provider_id: string; api_key?: string }) =>
    req<{ ok: boolean; error?: string }>("POST", "/setup/test-provider", body),
  completeSetup: (body: Record<string, string | null | undefined>) =>
    req<{ ok: boolean }>("POST", "/setup/complete", body),

  // Agents
  listAgents: () => req<AgentConfig[]>("GET", "/api/agents"),
  getAgent: (id: string) => req<AgentConfig>("GET", `/api/agents/${id}`),
  createAgent: (body: Partial<AgentConfig>) => req<AgentConfig>("POST", "/api/agents", body),
  updateAgent: (id: string, body: Partial<AgentConfig>) => req<AgentConfig>("PUT", `/api/agents/${id}`, body),
  deleteAgent: (id: string) => req<{ ok: boolean }>("DELETE", `/api/agents/${id}`),

  // Sessions
  listSessions: () => req<SessionView[]>("GET", "/api/sessions"),
  getSession: (id: string) => req<SessionView>("GET", `/api/sessions/${id}`),
  getSystemPrompt: (id: string) => req<{ content: string }>("GET", `/api/sessions/${id}/system-prompt`),
  createSession: (body: { agent_id: string; model?: string }) =>
    req<SessionView>("POST", "/api/sessions", body),
  deleteSession: (id: string) => req<{ ok: boolean }>("DELETE", `/api/sessions/${id}`),
  archiveSession: (id: string) => req<{ ok: boolean }>("POST", `/api/sessions/${id}/archive`),
  restoreSession: (id: string) => req<{ ok: boolean }>("POST", `/api/sessions/${id}/restore`),
  renameSession: (id: string, title: string) =>
    req<{ ok: boolean }>("PATCH", `/api/sessions/${id}`, { title }),
  pinSession: (id: string) => req<{ ok: boolean }>("POST", `/api/sessions/${id}/pin`),
  unpinSession: (id: string) => req<{ ok: boolean }>("POST", `/api/sessions/${id}/unpin`),
  setMainSession: (id: string) => req<{ ok: boolean }>("POST", `/api/sessions/${id}/set-main`),
  unsetMainSession: (id: string) => req<{ ok: boolean }>("POST", `/api/sessions/${id}/unset-main`),

  // Memory
  listMemory: () => req<{ id: string; name: string; description?: string }[]>("GET", "/api/memory"),
  getMemory: (topic: string) =>
    req<{ id: string; content: string; file_path: string; updated_at: number }>("GET", `/api/memory/${topic}`),
  saveMemory: (topic: string, content: string) =>
    req<{ ok: boolean; updated_at: number }>("PUT", `/api/memory/${topic}`, { content }),
  createMemory: (name: string) => req<{ id: string }>("POST", "/api/memory", { name }),
  deleteMemory: (topic: string) => req<{ ok: boolean }>("DELETE", `/api/memory/${topic}`),

  // Knowledge
  listKnowledge: () => req<{ id: string; name: string; updated_at: number; description?: string }[]>("GET", "/api/knowledge"),
  getKnowledge: (name: string) =>
    req<{ id: string; content: string; updated_at: number; file_path: string }>("GET", `/api/knowledge/${name}`),
  saveKnowledge: (name: string, content: string) =>
    req<{ ok: boolean; updated_at: number }>("PUT", `/api/knowledge/${name}`, { content }),
  createKnowledge: (name: string) => req<{ id: string }>("POST", "/api/knowledge", { name }),
  deleteKnowledge: (name: string) => req<{ ok: boolean }>("DELETE", `/api/knowledge/${name}`),

  // Tasks
  listTasks: () => req<TaskConfig[]>("GET", "/api/tasks"),
  getTask: (name: string) => req<TaskConfig>("GET", `/api/tasks/${name}`),
  createTask: (body: Partial<TaskConfig>) => req<TaskConfig>("POST", "/api/tasks", body),
  updateTask: (name: string, body: Partial<TaskConfig>) => req<TaskConfig>("PUT", `/api/tasks/${name}`, body),
  deleteTask: (name: string) => req<{ ok: boolean }>("DELETE", `/api/tasks/${name}`),
  runTask: (name: string) => req<{ run_id: string }>("POST", `/api/tasks/${name}/run`),
  listTaskRuns: (name: string) => req<TaskRun[]>("GET", `/api/tasks/${name}/runs`),

  // Skills
  listSkills: () => req<SkillConfig[]>("GET", "/api/skills"),
  getSkill: (id: string) => req<SkillConfig & { instructions: string; files: string[] }>("GET", `/api/skills/${id}`),
  deleteSkill: (id: string) => req<{ ok: boolean }>("DELETE", `/api/skills/${id}`),

  // Files
  fileMtime: (path: string) =>
    req<{ mtime: number }>("GET", `/api/files/mtime?path=${encodeURIComponent(path)}`),
  fileOpen: (path: string) => req<{ ok: boolean }>("POST", "/api/files/open", { path }),

  // Settings
  getSettings: () => req<{
    main_agent_id: string | null
    main_session_id: string | null
    telegram?: { bot_token: string; chats: { name: string; chat_id: string }[] }
  }>("GET", "/api/settings"),
  patchSettings: (body: {
    main_agent_id?: string | null
    main_session_id?: string | null
    telegram?: { bot_token?: string; chats?: { name: string; chat_id: string }[] }
  }) => req<{ ok: boolean }>("PATCH", "/api/settings", body),
}

// Types (mirroring backend Pydantic models)
export interface AgentConfig {
  id: string
  name: string
  provider_id: "claude-cli" | "openrouter"
  model: string
  color: string
  avatar_url?: string | null
  system_prompt: string
  builtin: boolean
  file_path?: string
  updated_at?: number | null
}

export interface ExternalChat {
  provider: string
  chat_id: string
  name: string
}

export interface SessionView {
  id: string
  title: string
  agent: AgentConfig
  model: string
  sticky: boolean
  archived: boolean
  is_main: boolean
  source: "manual" | "scheduled" | "trigger"
  task_name?: string | null
  messages: MessageView[]
  created_at: string
  updated_at: string
  external_chat?: ExternalChat | null
}

export interface MessageView {
  role: "user" | "assistant"
  content: string
  tool_calls: ToolCallView[]
  timestamp: string
}

export interface ToolCallView {
  id: string
  tool: string
  input_summary: string
  output_summary?: string | null
  status: "running" | "done" | "error"
  duration_ms?: number | null
}

export interface TaskConfig {
  name: string
  cron: string
  agent_id: string
  model?: string | null
  prompt: string
  enabled: boolean
  sticky_session: boolean
  use_main_session: boolean
  file_path?: string
  updated_at?: number | null
}

export interface TaskRun {
  id: string
  task_name: string
  status: "pending" | "running" | "done" | "failed"
  scheduled_at: string
  started_at?: string | null
  completed_at?: string | null
  session_id?: string | null
  error?: string | null
}

export interface SkillConfig {
  id: string
  description: string
  path: string
  builtin: boolean
  arguments: Record<string, { description?: string; default?: unknown; required?: boolean }>
}
