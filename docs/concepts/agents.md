# Agents

An agent is Yapflows' core abstraction. It defines the personality and instructions the AI model receives, and it declares which provider and model to use. Every conversation is tied to exactly one agent for its entire lifetime.

## What an agent is

An agent is a markdown file with a short block of YAML front matter at the top. The front matter holds structured configuration (name, provider, model, appearance). The body — everything after the front matter — becomes the system prompt that the model receives at the start of each conversation.

This format is deliberately simple. Agents are human-authored text files, readable in any editor, stored at `~/.yapflows/agents/{name}.md` for user-defined agents or `backend/agents/{name}.md` for built-in agents.

## Front matter fields

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | No | Display name in the UI. Defaults to the file stem if omitted. |
| `provider` | Yes | Which runtime to use: `claude-cli` or `openrouter` |
| `model` | Yes | The default model for this agent. Can be overridden when starting a chat. |
| `color` | No | Accent color for the agent's avatar in the UI (hex). |
| `avatar_url` | No | URL to an avatar image. |

The body of the file — everything after the closing `---` — is the system prompt. Front matter is stripped before the prompt is assembled; the model never sees it.

## Provider ownership

The provider is declared inside the agent, not chosen at chat start. This is intentional: an agent written for Claude CLI behaves differently from one written for OpenRouter because the capabilities are fundamentally different.

**Claude CLI agents** are fully autonomous. The `claude` subprocess handles file operations, web browsing, memory, and everything else internally. You write the system prompt; Claude CLI figures out how to execute it.

**OpenRouter agents** have explicit tools: a bash shell and a browser. The agent receives instructions describing these tools and invokes them explicitly. The system prompt should guide the agent on when and how to use them.

Mixing providers makes no sense — a Claude CLI agent cannot call OpenRouter tools and vice versa. Declaring the provider in the agent keeps this relationship explicit.

## Agent discovery

When Yapflows looks up an agent by name, it searches in this order:

1. `~/.yapflows/agents/{name}.md` — user-defined
2. `backend/agents/{name}.md` — built-in

User agents override built-ins with the same name. This means you can customise the default `assistant` agent by creating your own version at `~/.yapflows/agents/assistant.md`.

## Built-in agents

Yapflows ships with at least one built-in agent (`assistant`) as a sensible default. Built-in agents appear in the Agents tab with a visual indicator and cannot be deleted through the UI (though their files can be replaced by user agents with the same name).

## System prompt assembly

Before each conversation turn, Yapflows assembles the full system prompt from three parts:

1. The agent's body text
2. The contents of `~/.yapflows/memory/default.md` (if it exists)
3. Framework instructions: memory conventions, knowledge conventions, and the list of available skills

The model sees this assembled prompt as its context. Topic memory files and knowledge documents are not included automatically — they are loaded on demand via `@mention` or `#mention` in the chat, or by the agent itself using bash.

## Editing agents

In the Agents tab, user-defined agents have an editable system prompt. Changes are saved back to the markdown file. Built-in agent prompts are shown as read-only.

Use the "New chat with this agent" button in the Agents tab to start a conversation with the currently selected agent pre-filled.
