# File Formats

Yapflows uses two file formats: markdown with YAML front matter (for human-authored definitions) and JSON (for machine-generated records). The distinction is intentional — definitions are meant to be read and written by people; records are written by the system.

## Agent files

**Location:** `~/.yapflows/agents/{name}.md` (user) or `backend/agents/{name}.md` (built-in)

Front matter fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | No | File stem | Display name in the UI |
| `provider` | string | Yes | — | `claude-cli` or `openrouter` |
| `model` | string | Yes | — | Default model for this agent |
| `color` | string | No | `#6366f1` | Hex accent color for the avatar |
| `avatar_url` | string | No | `null` | URL to an avatar image |

The file body (everything after the closing `---`) is the system prompt. Front matter is stripped before the prompt is assembled.

## Task files

**Location:** `~/.yapflows/tasks/{name}.md`

Front matter fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `cron` | string | Yes | — | Standard cron expression |
| `agent` | string | Yes | — | Agent identifier (file stem) |
| `model` | string | No | `null` | Model override; `null` uses agent's default |
| `enabled` | boolean | No | `true` | Whether the task fires on schedule |
| `sticky_session` | boolean | No | `false` | Reuse one session across all runs |

The file body is the prompt sent to the agent on each run.

## Trigger files

**Location:** `~/.yapflows/triggers/{name}.md`

Front matter fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `agent` | string | Yes | — | Agent identifier (file stem) |
| `model` | string | No | `null` | Model override; `null` uses agent's default |

The file body is the prompt template. Use `{{payload}}` where the incoming event payload should be interpolated.

## Session files

**Location:** `~/.yapflows/chats/{session_id}.json` (active) or `~/.yapflows/archive/{session_id}.json` (archived)

Sessions are JSON records written by the system. Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique session identifier |
| `title` | string | Auto-set from first user message |
| `agent_id` | string | Agent used for this session |
| `provider_id` | string | Provider resolved from agent at creation |
| `model` | string | Model used, may be overridden from agent default |
| `messages` | array | Full message history |
| `sticky` | boolean | Whether the session is pinned |
| `source` | string | `manual`, `scheduled`, or `trigger` |
| `created_at` | datetime | ISO 8601 |
| `updated_at` | datetime | ISO 8601 |
| `cli_session_id` | string or null | Claude CLI session ID for multi-turn resumption |

Each message in the `messages` array:

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `user` or `assistant` |
| `content` | string | Full text content |
| `tool_calls` | array | Tool calls made during this turn (empty for Claude CLI) |
| `timestamp` | datetime | ISO 8601 |

## Task run files

**Location:** `~/.yapflows/runs/{id}.json`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique run identifier |
| `task_name` | string | Name of the task that generated this run |
| `status` | string | `pending`, `running`, `done`, or `failed` |
| `scheduled_at` | datetime | When the run was scheduled to occur |
| `started_at` | datetime or null | When execution began |
| `completed_at` | datetime or null | When execution ended |
| `session_id` | string or null | Session created or used for this run |
| `error` | string or null | Error message if status is `failed` |

## Settings file

**Location:** `~/.yapflows/settings.json`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `openrouter_api_key` | string or null | `null` | OpenRouter API key |
| `telegram_bot_token` | string or null | `null` | Telegram bot token |
| `telegram_allowed_chat_ids` | array of integers | `[]` | Permitted Telegram chat IDs |
| `log_level` | string | `"INFO"` | `DEBUG`, `INFO`, `WARNING`, or `ERROR` |
| `log_keep` | integer | `30` | Number of log files to retain |
| `dev_mode` | boolean | `false` | Whether to write logs to stdout |

## Memory and knowledge files

**Location:** `~/.yapflows/memory/{topic}.md` and `~/.yapflows/knowledge/{name}.md`

Plain markdown. No front matter, no required structure. The agent reads and writes these using bash.

`default.md` in the memory directory is the only file with special treatment — it is auto-loaded into the system prompt at the start of every conversation. All other files are loaded on demand.
