# API Reference

Yapflows exposes a REST API (FastAPI) and a WebSocket endpoint for real-time streaming. The frontend communicates exclusively through these interfaces.

## Base URL

In development: `http://localhost:8000`

## REST Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{"status": "ok"}`. Used by Docker health checks. |

### Setup

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/setup/status` | Returns `{"required": bool}`. True when no provider has been configured. |
| `POST` | `/setup/test-provider` | Test a provider connection. Returns `{"ok": bool, "error": string or null}`. |
| `POST` | `/setup/complete` | Write settings and seed memory. Marks setup as complete. |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List all agents (user + built-in). |
| `GET` | `/api/agents/{id}` | Get a single agent by ID. |
| `POST` | `/api/agents` | Create a new agent file. |
| `PUT` | `/api/agents/{id}` | Update an agent's system prompt or front matter. |
| `DELETE` | `/api/agents/{id}` | Delete a user-defined agent. |

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List all active sessions. |
| `GET` | `/api/sessions/archived` | List all archived sessions. |
| `GET` | `/api/sessions/{id}` | Get a session as a `SessionView`. |
| `POST` | `/api/sessions` | Create a new session. Body: `{agent_id, model}`. |
| `PATCH` | `/api/sessions/{id}` | Update title, sticky status. |
| `POST` | `/api/sessions/{id}/archive` | Archive a session. |
| `POST` | `/api/sessions/{id}/restore` | Restore an archived session. |
| `DELETE` | `/api/sessions/{id}` | Permanently delete a session. |

### Memory

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/memory` | List all memory topic files. |
| `GET` | `/api/memory/{topic}` | Get the content of a topic file. |
| `PUT` | `/api/memory/{topic}` | Create or update a topic file. |
| `DELETE` | `/api/memory/{topic}` | Delete a topic file (not allowed for `default`). |

### Knowledge

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/knowledge` | List all knowledge documents. |
| `GET` | `/api/knowledge/{name}` | Get a document's content. |
| `PUT` | `/api/knowledge/{name}` | Create or update a document. |
| `DELETE` | `/api/knowledge/{name}` | Delete a document. |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List all tasks. |
| `GET` | `/api/tasks/{name}` | Get a task's definition and recent runs. |
| `POST` | `/api/tasks` | Create a new task. |
| `PUT` | `/api/tasks/{name}` | Update a task's definition. |
| `DELETE` | `/api/tasks/{name}` | Delete a task. |
| `POST` | `/api/tasks/{name}/run` | Enqueue an immediate run. |
| `POST` | `/api/tasks/{name}/enable` | Enable a disabled task. |
| `POST` | `/api/tasks/{name}/disable` | Disable an enabled task. |

### Skills

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/skills` | List all skills (user + built-in). |
| `GET` | `/api/skills/{name}` | Get a skill's metadata and skill.md content. |

### Triggers

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/triggers/{name}` | Fire a named webhook trigger. Body is passed as `{{payload}}`. |

### Environments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/environments` | List all environments (user + built-in). |
| `GET` | `/api/environments/{id}` | Get a single environment. |
| `POST` | `/api/environments` | Create a user environment. |
| `PUT` | `/api/environments/{id}` | Update a user environment. |
| `DELETE` | `/api/environments/{id}` | Delete a user environment. |

### Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Get current settings. Sensitive keys are masked. |
| `PUT` | `/api/settings` | Update settings. |

## WebSocket

### Connection

Connect to `ws://localhost:8000/ws/{session_id}` to stream a conversation.

### Client → Server messages

| Type | Fields | Description |
|------|--------|-------------|
| `message` | `content: string` | Send a user message to the agent. |
| `stop` | — | Cancel the in-progress agent turn. |
| `interaction_response` | `value: string` | Respond to an agent interaction request. |

### Server → Client messages

| Type | Fields | Description |
|------|--------|-------------|
| `text_chunk` | `content: string` | A streamed text fragment from the agent. |
| `tool_start` | `tool: string`, `input: object` | An agent tool call has started (OpenRouter only). |
| `tool_done` | `tool: string`, `output: string` | A tool call completed (OpenRouter only). |
| `done` | — | The agent turn is complete. |
| `error` | `message: string` | An error occurred during the turn. |

Messages are JSON-encoded. The frontend assembles `text_chunk` events into the full response and renders `tool_start`/`tool_done` pairs as collapsible strips.
