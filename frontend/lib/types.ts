// Re-export all types from api.ts for convenience
export type {
  AgentConfig,
  SessionView,
  MessageView,
  ToolCallView,
  TaskConfig,
  TaskRun,
  SkillConfig,
} from "./api"

// UI-level types for chat rendering (built from streaming events, not persisted)
export interface TextBlock {
  type: "text"
  content: string
}

export interface ToolBlock {
  type: "tool"
  id: string
  name: string
  args?: Record<string, unknown>
  result?: string
  status: "running" | "done" | "error"
}

export interface ChatAskBlock {
  type: "chat_ask"
  requestId: string
  question: string
  inputType: "text" | "single_choice" | "multi_choice" | "confirmation"
  options: string[]
  answered?: boolean
  answer?: string
}

export interface FormQuestion {
  name: string
  question: string
  input_type: "text" | "single_choice" | "multi_choice" | "confirmation"
  options: string[]
}

export interface ChatFormBlock {
  type: "chat_form"
  requestId: string
  questions: FormQuestion[]
  paginated: boolean
  answered?: boolean
  answers?: Record<string, string>
}

export type Block = TextBlock | ToolBlock | ChatAskBlock | ChatFormBlock

export interface ChatMessage {
  id: string
  agentId?: string
  role: "user" | "assistant"
  blocks: Block[]
  done: boolean
  queued?: boolean
}
