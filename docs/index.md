# Introduction

Yapflows is a personal AI assistant you run on your own machine. You chat with agents, schedule them to run autonomously, connect them to external services, and give them long-term memory — all without sending your data to a third-party platform.

There is no cloud subscription, no account, and no data leaves your machine unless you configure it to. Every piece of information — conversations, memory, knowledge, tasks — lives in a single folder on your filesystem.

## What Yapflows is

Yapflows is built around one simple idea: **one conversation, one agent**. You pick an agent, start a chat, and talk. The agent can use tools, remember things about you across conversations, and act autonomously on a schedule or in response to external events.

The same agent that you chat with in the browser can be triggered by a Telegram message, run on a cron schedule, or invoked from a webhook — and it keeps the same memory and knowledge across all of those contexts.

## Key features

<div class="grid cards" markdown>

-   **Multiple Providers**

    Use Claude CLI (runs locally via your Anthropic subscription) or OpenRouter (any model via API key). Each agent declares its own provider.

-   **Long-Term Memory**

    A default memory file is loaded in every conversation. Topic files are pulled in on demand. The agent maintains your memory automatically.

-   **Knowledge Base**

    Store reference documents alongside your conversations. Reference them in chat with a `#name` mention to load them into context.

-   **Scheduled Tasks**

    Define cron-scheduled tasks that run an agent automatically. View run history and jump to the resulting chat session.

-   **Triggers**

    React to external events. Connect a Telegram bot or expose a webhook endpoint — both route to an agent session.

-   **Skills**

    Reusable capabilities the agent can invoke via shell. Drop a directory into your skills folder and the agent discovers it automatically.

-   **File-Based Storage**

    Everything lives in `~/.yapflows/`. Agents, tasks, memory, and sessions are plain files — readable and editable in any text editor.

-   **Real-Time Streaming**

    Responses stream word-by-word over WebSocket. Tool calls appear as collapsible strips as they run. Stop a response mid-stream at any time.

</div>

## How it works

When you start a chat, Yapflows:

1. Loads the agent's system prompt from its definition file
2. Appends your default memory file to the prompt
3. Lists available skills so the agent knows what it can do
4. Opens a WebSocket connection and begins streaming

The agent runs in its configured provider — either the `claude` CLI subprocess or the OpenRouter API. All tool calls, memory reads and writes, and file operations happen inside the agent's own runtime. Yapflows orchestrates the conversation; the agent does the work.

## Providers

Two providers ship with Yapflows:

**Claude CLI** runs the `claude` command-line tool as a subprocess. It requires an Anthropic subscription but no API key configuration. Claude CLI is a fully autonomous agent — it handles file operations, web browsing, and everything else internally. Yapflows streams the conversation to it and reads the output.

**OpenRouter** calls any model available on OpenRouter via an API key. It runs through the Strands Agents SDK with built-in tools for shell execution and browser automation.

## Navigation

Use the nav rail on the right edge of the app (or keyboard shortcuts) to move between sections:

| Section | What you do there |
|---------|-------------------|
| Chats | Start and continue conversations |
| Agents | View and edit agent definitions |
| Knowledge | Manage reference documents |
| Memory | View and edit your memory files |
| Tasks | Define and monitor scheduled tasks |
| Skills | Browse available skills |
| Settings | Configure providers, integrations, and app settings |
