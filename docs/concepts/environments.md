# Environments

An environment is a named preset that pairs a provider with a specific model. Where agents define *who* the assistant is (its persona, instructions, and provider type), environments define *how* it runs — which exact model to use.

## What environments are for

The same agent can behave differently depending on which model it runs on. You might use a fast, cheap model for quick tasks and a more capable model for complex reasoning. Environments let you define these presets once and pick between them when starting a chat, rather than typing a model identifier each time.

## Built-in environments

Yapflows ships with built-in environments for common configurations — for example, a Claude CLI environment and several OpenRouter presets using Haiku-class models. Built-in environments are stored in `backend/environments/` and are always available.

## User environments

You can create your own environments at `~/.yapflows/environments/{id}.json`. User environments are listed alongside built-ins and follow the same format. A user environment with the same `id` as a built-in takes precedence.

## Environment fields

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier (used in URLs and file names) |
| `name` | Display name shown in the environment picker |
| `provider_id` | Which provider this environment uses: `claude-cli` or `openrouter` |
| `model` | The model identifier to pass to the provider |
| `builtin` | Whether this is a built-in environment (set by the system) |

## Selecting an environment

When starting a new chat on the home screen, you pick both an agent and an environment. The agent's declared provider must match the environment's provider — you cannot pair a Claude CLI agent with an OpenRouter environment.

The default environment is remembered across sessions so you do not have to re-select it each time.

## Managing environments

Environments can be created and edited in Settings. Built-in environments are shown as read-only; user environments can be edited or deleted.

!!! note
    If you only have one provider configured, only environments matching that provider will be available in the chat start picker.
