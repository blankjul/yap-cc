# Triggers

Triggers connect external events to agent sessions. Where tasks are time-driven (run at a scheduled time), triggers are event-driven (fire when something happens outside Yapflows).

## The two trigger types

| Trigger | Event source | Configuration |
|---------|-------------|---------------|
| Telegram | Incoming message to your bot | Settings tab |
| Webhook | HTTP POST to a named endpoint | File-based only |

## Telegram integration

Telegram is the primary user-facing trigger. Once configured, any Telegram message sent to your bot is routed to an agent session, and the agent's reply is sent back.

Each Telegram chat (user or group) maps to a single sticky session in Yapflows. The session persists across messages — the agent builds up conversation history with that contact over time, just like a regular chat session.

Telegram sessions show the Telegram logo in the Chats sidebar.

Configuration requires:

1. A bot token from BotFather
2. A list of allowed Telegram chat IDs (for access control)

Both are set in Settings → Integrations. See the [Telegram guide](../guides/telegram.md) for a step-by-step walkthrough.

## Webhook triggers

A webhook trigger fires when an HTTP POST request arrives at `/api/triggers/{name}`. The request body (the payload) is interpolated into the trigger's prompt template and sent to the agent.

Webhooks have no UI management panel. They are defined entirely as files:

- File location: `~/.yapflows/triggers/{name}.md`
- Same format as agents and tasks: YAML front matter for configuration, body for the prompt template

The prompt template can include `{{payload}}` which is replaced with the incoming request body before being sent to the agent. This lets you wire in events from GitHub, CI systems, monitoring tools, or any service that can send a webhook.

## Trigger configuration fields

| Field | Purpose |
|-------|---------|
| `agent` | Which agent handles the trigger |
| `model` | Model override (leave blank to use agent default) |
| Body | The prompt template sent to the agent (`{{payload}}` is interpolated) |

## Design philosophy

Triggers are intentional plumbing — internal wiring between external signals and agent sessions. They do not need a management UI: webhook triggers are defined in files (version-controllable, editable in any editor), and Telegram is configured in Settings.

This keeps the UI focused on what you interact with directly (chats, agents, memory, tasks) while automation happens in the background.

!!! warning
    Webhook endpoints are unauthenticated by default. If you expose Yapflows on a network, protect webhook endpoints at the reverse-proxy level or restrict access by source IP.
