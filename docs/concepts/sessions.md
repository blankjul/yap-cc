# Sessions

A session is a single conversation thread. It ties together an agent, a provider, a model, and a full message history. Once created, a session's agent, provider, and model are fixed for its entire lifetime.

## Session lifecycle

Sessions are created in one of three ways:

| Source | Created by |
|--------|-----------|
| Manual | You click "New Chat" on the home screen |
| Scheduled | A cron task runs and creates a session automatically |
| Trigger | An external event (Telegram message, webhook) creates a session |

The source is stored on the session and is visible in the Chats sidebar. Scheduled sessions show a gear icon; Telegram sessions show the Telegram logo.

## Starting a chat

When you start a new chat manually, you:

1. Pick an agent — provider and default model come from the agent's definition
2. Optionally change the model — the agent's default is pre-filled; you can override it

That's the entire setup. Provider is not a separate choice — it is baked into the agent.

## Session title

The session title is set automatically from your first message, truncated at around 60 characters. You can rename it at any time by double-clicking the title in the session list.

## Filtering

The session list has three filter views:

**Active** — all non-archived sessions, grouped by date (Today / Yesterday / Older). This is the default view.

**Archived** — all archived sessions, shown as read-only. Archived sessions display message history but the composer is hidden. A "Restore to active" button returns the session to the Active view.

**Scheduled** — sessions created by tasks, grouped by task name. Shows metadata about which task created each session and when it ran.

## Sticky sessions

Any session can be pinned. Sticky sessions:

- Appear at the top of the Active session list, above date groups, with a pin indicator
- Are never auto-archived
- Can be pinned by you (via the row actions menu) or automatically (by tasks with `sticky_session: true` or by Telegram triggers)

!!! warning
    Sticky sessions cannot be archived while pinned. Unpin first, then archive.

## Empty sessions

Empty sessions — those with no messages — are hidden from the session list, except for the most recently created one. This prevents ghost sessions from accumulating if you click "New Chat" multiple times without sending anything.

## Archiving and deletion

Sessions can be archived or permanently deleted via the row actions menu (`...`) in the session list.

- **Archive** moves the session to the Archived view. It becomes read-only.
- **Restore** moves an archived session back to Active.
- **Delete** permanently removes the session. This action is irreversible.

## Streaming

Agent responses stream in real time over WebSocket. Text arrives word-by-word. For OpenRouter agents, tool calls appear as collapsible strips showing the tool name, input, and result as they execute.

While a response is streaming, a Stop button appears in the chat composer. Clicking it cancels the current agent turn. The partial response up to that point is saved to the session.

## Row actions

Each session in the sidebar has a context menu accessible via the `...` button on hover:

| Action | Effect |
|--------|--------|
| Rename | Inline rename (or double-click the title) |
| Pin / Unpin | Toggle sticky status |
| Archive | Move to Archived view (disabled for pinned sessions) |
| Delete | Permanently delete |
