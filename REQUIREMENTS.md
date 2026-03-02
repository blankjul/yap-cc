# Yapflows — Requirements

## Vision
A lightweight, self-hosted personal AI assistant framework.
You chat with one agent at a time. Agents can use tools, remember things across
conversations, and act autonomously via scheduled or triggered tasks.

---

## 1. Provider System

### 1.1 Supported Providers

| Provider     | How it runs                                  | API Key        | Tools      |
|--------------|----------------------------------------------|----------------|------------|
| `claude-cli` | Runs `claude -p` (headless), uses subscription | None required | None (n/a) |
| `openrouter` | Calls OpenRouter REST API via Strands SDK    | Required       | Strands tools |

### 1.2 Provider Configuration
- Providers are configured globally in settings (`~/.yapflows/settings.json`)
- Provider is declared per-agent (in the agent's front matter) — not chosen at chat start
- Provider determines available models

### 1.3 Tools — A Strands Concept

**Tools only exist in the `openrouter` provider.**

Tools are Python functions decorated with `@tool` from the Strands Agents SDK.
Strands handles schema generation, tool dispatch, and result injection into the model context.

**`claude-cli` provider has no tools.** It is a fully autonomous subprocess.
Yapflows streams the conversation to `claude -p` and reads back output — nothing more.
Claude CLI handles file ops, web search, and everything else internally.

**`openrouter` built-in tools** (defined in `backend/src/tools/`, all `@tool` decorated):
- `bash` — shell command execution (covers file I/O, search, memory, knowledge, etc.)
- `browser` — Playwright automation (navigate, click, screenshot, etc.)

Memory and knowledge are not separate tools — the agent is given instructions (injected into
the system prompt) describing where files live and how to read/write them via `bash`.
This is the same pattern Claude Code uses for its own memory and file access.

Tools are **not user-configurable**. The full built-in set is always active for openrouter.

---

## 2. Agent System

### 2.1 Single-Agent Conversations
One conversation = one agent. No multi-agent handoffs or side-channels.

### 2.2 Agent Definition
An agent is a **single markdown file** with YAML front matter:

```markdown
---
name: Assistant
provider: claude-cli
model: claude-opus-4-5
color: "#6366f1"
avatar_url: null
---

You are a helpful assistant...
```

| Field       | Purpose                                       | Required |
|-------------|-----------------------------------------------|----------|
| `provider`  | `claude-cli` or `openrouter`                  | Yes      |
| `model`     | Default model for this agent                  | Yes      |
| `name`      | Display name in UI                            | No (defaults to file stem) |
| `color`     | Accent color for avatar / header              | No       |
| `avatar_url`| Avatar image URL                              | No       |
| body        | System prompt / personality                   | Yes      |

**The agent owns its provider.** An agent written for `openrouter` uses bash tools;
an agent written for `claude-cli` is fully autonomous. Mixing them makes no sense,
so the provider is declared in the agent, not chosen at runtime.

The `model` is a default — the user can override it when starting a chat.
Front matter is stripped before the system prompt is assembled.

### 2.3 Agent Discovery
Search order: `~/.yapflows/agents/{name}.md` → built-in `backend/agents/{name}.md`
User agents override built-ins with the same name.

### 2.4 Built-in Agents
At least one default agent (`assistant`) shipped with the project.

---

## 3. Conversation / Session System

### 3.1 Sessions
- Stored in `~/.yapflows/chats/{session_id}.json`
- Contains: metadata, full message history, and session config:
  ```json
  {
    "agent_id": "assistant",
    "provider_id": "claude-cli",
    "model": "claude-opus-4-5"
  }
  ```
- Can be archived or deleted
- Title is set automatically from the first user message (truncated at ~60 chars).
  The user can rename at any time via inline double-click in the session list.

### 3.2 Session Filtering
The session list supports three views, toggled via a filter bar at the top of the panel:

| Filter      | Shows                                                      |
|-------------|-------------------------------------------------------------|
| `Active`    | All non-archived sessions, grouped by date                 |
| `Archived`  | All archived sessions (read-only)                          |
| `Scheduled` | Sessions created by tasks, grouped by task name + schedule |

The `Scheduled` view shows metadata: which task created the session, when it ran, duration.
Default view is `Active`.

### 3.4 Empty Session Filtering
Empty sessions (no messages) are hidden from the session list — **except** the most recently
created one. This prevents ghost sessions from accumulating when the user clicks "New Chat"
multiple times without sending a message.

### 3.5 Sticky Sessions
Any session can be marked sticky. Sticky sessions:
- Are pinned at the **top** of the session list (with a distinct visual indicator)
- Are **never** auto-archived
- Are created by integrations (Telegram) or manually pinned by the user
- The user can pin/unpin any session via a pin button in the session list row

### 3.6 Session Sources

| Source      | Created by                                 |
|-------------|---------------------------------------------|
| `manual`    | User clicks "New Chat"                      |
| `scheduled` | Scheduler (cron task)                       |
| `trigger`   | External trigger (e.g., Telegram message)   |

### 3.7 Starting a New Chat
When creating a new chat, the user:
1. **Picks an agent** — provider and default model are read from the agent's front matter
2. **Optionally overrides the model** — the agent's default is pre-filled; user can change it

That's it. Provider is not a separate choice — it comes with the agent.
The resolved `agent_id`, `provider_id`, and `model` are stored in the session and fixed for
the lifetime of that chat.

### 3.8 Real-time Streaming
- Agent responses stream over WebSocket (text chunks)
- Tool events stream (tool_start, tool_done) — openrouter provider only
- The user can **stop** an in-progress response at any time via a Stop button in the chat
  composer. The partial response is saved to the session as-is; the agent turn ends.

### 3.9 Archive Behavior
- Archived sessions are **read-only** — the message history is visible but the composer is hidden
- An archived session can be **re-activated** (restored to active) from the Archived view
- Sticky sessions cannot be archived
- Permanent deletion is a separate action (available on both active and archived sessions)

---

## 4. Memory System

Memory is what the agent learns **about the user** across conversations —
preferences, habits, ongoing context, things shared in previous chats.
It is personal and cumulative. **One file is always loaded. Everything else is on demand.**

### 4.1 Memory Files

| File                              | Auto-loaded        | Maintained by   |
|-----------------------------------|--------------------|-----------------|
| `~/.yapflows/memory/default.md`   | Every conversation | Agent + user    |
| `~/.yapflows/memory/{topic}.md`   | Never (on demand)  | Agent           |

`default.md` is the only file injected automatically.
Topic files are created and loaded by the agent when a conversation touches that subject.
This keeps the default context window small — the agent pulls in more only when it matters.

**Example topic files:**
- `work-projects.md` — loaded when discussing work tasks
- `recipes.md` — loaded when discussing cooking
- `reading-list.md` — loaded when discussing books

The agent decides both *where* to store new information and *when* to load existing topics.

The user can reference a memory topic in the chat composer by typing `@topic-name`.
This does two things:
- Triggers autocomplete showing matching topic file names
- When sent, the content of `~/.yapflows/memory/{topic}.md` is appended to the message,
  making it available to the agent for that turn

This is how a user says "use my work context for this answer" without the agent having
to decide. The topic content is **not** injected into every subsequent turn — just this one
unless the agent chooses to read it again.

### 4.2 System Prompt Assembly
At the start of every conversation, the system prompt is built as:
```
[agent body — front matter stripped]
---
[~/.yapflows/memory/default.md, if exists]
```

Only `default.md` is auto-loaded. Topic files are loaded explicitly by the agent via `memory_read`.

### 4.3 Memory Maintenance
- The agent reads and writes memory files via `bash` (`cat`, `echo`, `sed`, etc.)
- The system prompt includes instructions explaining the memory directory and file conventions
- Memory is plain markdown — no special format required
- `default.md` should be kept short; the agent is instructed to move detail into topic files
- Compaction = the agent rewrites a file to be more concise (via `bash`)

---

## 5. Knowledge Base

Knowledge is a **reference library of topic documents** — not personal context about the user,
but structured notes on subjects: how a project works, a research summary, a how-to guide.
Documents are loaded on demand, never by default.

### 5.1 Knowledge Documents
- Stored at `~/.yapflows/knowledge/{name}.md`
- Created by users or agents
- Referenced in chat with `#document-name` — triggers autocomplete and loads the doc into context
- Full-text searchable

### 5.2 Knowledge Access
No dedicated tools. The agent uses `bash` to list, read, search, create, and edit knowledge files.
The system prompt includes instructions describing the knowledge directory and naming conventions.

### 5.3 Memory vs. Knowledge

| Aspect        | Memory                                        | Knowledge                                      |
|---------------|-----------------------------------------------|------------------------------------------------|
| **What it is**| Things learned *about the user* across chats  | Reference docs on *topics and subjects*        |
| **Examples**  | "User prefers dark mode", "Works at Acme"     | Python packaging guide, project architecture   |
| **Maintained by** | Agent (automatic, during conversations)   | Agent or user (deliberate, manual)             |
| **Size**      | Small — kept concise                          | Large, arbitrary                               |
| **Loading**   | `default.md` always; topic files on demand    | On demand only                                 |
| **Location**  | `~/.yapflows/memory/`                         | `~/.yapflows/knowledge/`                       |

**Memory** is a personal diary the agent keeps about you — preferences, habits, ongoing context,
things you've told it. It grows conversation by conversation.

**Knowledge** is a reference library — structured notes on a subject, not tied to any one
conversation. Think of it as a wiki the agent (or you) can write and consult.

---

## 6. Scheduling System

Two separate concepts: **task definitions** (what to run and when) and **task runs** (each execution).

### 6.1 Task Definitions
Stored in `~/.yapflows/tasks/{name}.md` — same pattern as agents: YAML front matter for
structured config, body for the prompt:

```markdown
---
cron: "0 9 * * 1-5"
agent: assistant
model: null
enabled: true
sticky_session: false
---

Generate my daily standup report. Include what I worked on yesterday,
what I'm working on today, and any blockers.
```

`model: null` means use the agent's default. `sticky_session: true` reuses the same session
across all runs of this task (useful for heartbeats that accumulate state).

### 6.2 Task Runs
Each execution of a task is recorded as a `TaskRun`:

```json
{
  "id": "run-abc123",
  "task_name": "daily-standup",
  "status": "done",
  "scheduled_at": "2026-03-01T09:00:00",
  "started_at": "2026-03-01T09:00:01",
  "completed_at": "2026-03-01T09:02:14",
  "session_id": "sess-xyz",
  "error": null
}
```

Stored in `~/.yapflows/runs/{id}.json`. Persisted immediately on creation so the UI
always has a record, even if a run is in-flight.

### 6.3 Execution Flow

```
APScheduler fires (or user clicks "Run now")
         ↓
TaskRun created → written to disk (status: pending)
         ↓
Pushed onto asyncio.Queue
         ↓
Single background worker picks it up
         ↓
status → running
         ↓
Session created (or sticky session reused)
Prompt sent to agent, response streamed
         ↓
status → done  (session_id recorded)
      or failed (error recorded)
```

One task runs at a time. "Run now" pushes to the back of the queue — no jumping.

### 6.4 Management UI
The Tasks tab shows definition + upcoming schedule + run history together:

```
[daily-standup]  ● enabled   next run: tomorrow 09:00
Agent: assistant

Recent runs:
✓ today 09:00        2m 13s  → open chat
✓ yesterday 09:00    1m 58s  → open chat
✗ 2 days ago         failed  → timeout
                     [Run now]  [Edit]  [Disable]
```

---

## 7. Trigger System

Triggers react to **external events** (push-based, not scheduled).
Distinct from tasks (which are time-scheduled): triggers fire on incoming events.

### 7.1 Design Philosophy
Triggers are **internal plumbing** — they wire external signals to agent sessions.
There is no Triggers management tab in the UI. Webhook triggers are defined as files.
The only trigger with UI configuration is Telegram (configured in Settings).

### 7.2 Trigger Types (v1)

| Trigger    | Event source                        | Config            |
|------------|-------------------------------------|-------------------|
| `telegram` | Incoming Telegram message to the bot | Settings tab      |
| `webhook`  | HTTP POST to `/api/triggers/{name}` | File-only          |

### 7.3 Telegram Integration
- Configure: bot token + allowed chat IDs (in Settings tab)
- Each Telegram user/chat → one sticky session in yapflows
- Flow: incoming message → sticky session → agent responds → reply sent via Telegram
- Telegram sessions show a Telegram icon in the session list

### 7.4 Webhook Trigger
- Definition: `~/.yapflows/triggers/{name}.md` — same pattern as agents and tasks:
  ```markdown
  ---
  agent: assistant
  model: null
  ---

  New push event received: {{payload}}

  Summarise the changes and flag anything that looks risky.
  ```
- Endpoint: `POST /api/triggers/{name}`
- No UI management — create/edit the file directly
- The trigger interpolates `{{payload}}` into the prompt body and sends it to the agent

---

## 8. Skill System

Skills are reusable capabilities the agent can invoke via `bash`.
They are **not automatically executed** — the agent reads available skills from the system
prompt instructions and decides when and how to use them.

### 8.1 Skill Definition
A skill is a directory:

```
skills/
└── daily-standup/
    ├── skill.md          # Description + usage instructions for the agent
    ├── scripts/
    │   └── run.sh        # Executable(s) the agent can call
    └── assets/           # Supporting files (templates, data, etc.)
```

`skill.md` is the only required file. It tells the agent what the skill does and how
to invoke it (which script to run, what arguments it accepts, what output to expect).

### 8.2 Skill Discovery
Search order: `~/.yapflows/skills/{name}/` → built-in `backend/skills/{name}/`
User skills override built-ins with the same name.

### 8.3 Skill Object
```python
class Skill(BaseModel):
    id: str               # directory name
    description: str      # first paragraph of skill.md
    path: Path            # resolved directory path
```

### 8.4 Skills in the System Prompt
At conversation start, the system prompt includes instructions listing available skills
and explaining how to use bash to read `skill.md` and invoke scripts:

```
Available skills (use bash to inspect and run):
  - daily-standup   → ~/.yapflows/skills/daily-standup/
  - ...
Read skill.md in any skill directory for usage instructions.
```

The agent uses this to discover and invoke skills without any special tool — just `bash`.

### 8.5 Skill Access in Chat
The user can type `/skills` in the chat to list available skills or reference a specific
skill to load its description into context.

---

## 9. UI / UX Requirements

### 9.1 Global Shell

Every page shares the same outer shell:

```
┌─────────────────────────────────────────────────────────┐
│                                                     [nav]│
│  [left panel]  │  [main content]                    [ 1 ]│
│                │                                    [ 2 ]│
│                │                                    [ 3 ]│
│                │                                    [ 4 ]│
│                │                                    [ 5 ]│
│                │                                    [ 6 ]│
│                │                                    [ 7 ]│
│                │                                    [?  ]│
└─────────────────────────────────────────────────────────┘
```

- **Left panel** — collapsible, resizable. Content depends on the active tab.
- **Main content** — fills remaining space.
- **Nav rail** — right edge, icon buttons with shortcut hints. Always visible.

---

### 9.2 Home — New Chat (`/`)

No left panel. Main content is centered.

```
┌─────────────────────────────────────────────────────────┐
│                                                     [nav]│
│                                                          │
│              Start a new conversation                    │
│                                                          │
│         ┌──────────────────────────────────┐            │
│  Agent  │ ● Assistant  claude-cli  ▼       │            │
│         └──────────────────────────────────┘            │
│         ┌──────────────────────────────────┐            │
│  Model  │ claude-opus-4-5              ▼   │            │
│         └──────────────────────────────────┘            │
│                                                          │
│                   [ Start chat → ]                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

- Agent picker shows: color dot · name · provider badge
- Model field pre-filled from agent default; editable
- "Start chat" creates the session and navigates to `/chats?id=…`

---

### 9.3 Chats (`/chats?id={session_id}`)

```
┌────────────────┬────────────────────────────────────────┐
│ Chats    [↺][+]│  ● Assistant  claude-opus-4-5     [nav]│
│ Active│Arch│Sch│ ─────────────────────────────────      │
│ ─────────────  │  ╭─────────────────────────────╮      │
│ 📌 Pinned      │  │ What's on my plate today?   │      │
│  telegram-me   │  ╰─────────────────────────────╯      │
│  daily-standup │                                        │
│ ─────────────  │  ╭─────────────────────────────────╮  │
│ Today          │  │ ● Assistant                     │  │
│  Morning brief │  │                                 │  │
│▶ Planning sess │  │ Here's your schedule for today… │  │
│  Code review ⚙ │  ╰─────────────────────────────────╯  │
│ Yesterday      │                                        │
│  Research      │  ────────────────────────────────────  │
│  ...           │  ┌──────────────────────────────────┐  │
│                │  │ Type a message…    [■ stop][send ↵]│ │
│                │  └──────────────────────────────────┘  │
└────────────────┴────────────────────────────────────────┘
```

**Left panel — `SidebarPanel` with session list:**
- Header: `Chats` · `[↺]` · `[+]`
- Filter bar: `Active | Archived | Scheduled` tabs
- **Active view**: pinned sessions at top (📌 or integration logo), then date groups
  (Today / Yesterday / Older), sorted by last activity
- Scheduled sessions show a ⚙ icon indicating origin
- Active session highlighted
- Double-click to rename inline
- Row hover `[⋯]` menu: Rename · Pin/Unpin · Archive · Delete

**Main — chat view:**
- Header: agent color dot · name · model badge
- Message list scrolls; streams in real time
- Tool calls (openrouter) shown as collapsible strips:
  ```
  ▶ bash  ls ~/.yapflows/memory/      ✓ 0.2s
  ```
- Composer: plain textarea, `↵` sends, `shift+↵` newline
- `[■ stop]` button visible only while agent is streaming; cancels the turn
- Autocomplete popover on `@` (memory topics), `#` (knowledge docs), `/` (commands)
- **Archived sessions**: composer is hidden, replaced with `[Restore to active]` button

---

### 9.4 Agents (`/agents?id={agent_id}`)

```
┌────────────────┬────────────────────────────────────────┐
│ Agents  [↺][+] │  ● Assistant                      [nav]│
│ ─────────────  │  claude-cli · claude-opus-4-5          │
│▶ ● Assistant   │  ──────────────────────────────────    │
│  ● Coder  [⋯] │                                        │
│  ● Researcher  │  System prompt                         │
│                │  ┌──────────────────────────────────┐  │
│                │  │ You are a helpful assistant…     │  │
│                │  │                                  │  │
│                │  │ (read-only for built-in agents)  │  │
│                │  └──────────────────────────────────┘  │
│                │                                        │
│                │  [ New chat with this agent → ]        │
└────────────────┴────────────────────────────────────────┘
```

- `[+]` creates a new `~/.yapflows/agents/{name}.md` with default front matter
- Left panel: color dot · name · provider badge; built-in agents have no delete option
- Right panel: name, provider, model, full system prompt
- Built-in agents: prompt is read-only
- User agents: editable via `MarkdownEditor`; Save button on change
- "New chat with this agent →" navigates to `/` with that agent pre-selected

---

### 9.5 Knowledge (`/knowledge?id={name}`)

```
┌────────────────┬────────────────────────────────────────┐
│ Knowledge [↺][+│  python-packaging                 [nav]│
│ ─────────────  │  Last edited: today 14:32              │
│▶ python-pack…  │  ──────────────────────────────────    │
│  project-arch  │                                        │
│  reading-list  │  ┌──────────────────────────────────┐  │
│                │  │ # Python Packaging               │  │
│                │  │                                  │  │
│                │  │ Use `uv` for all projects.       │  │
│                │  │ …                                │  │
│                │  └──────────────────────────────────┘  │
│                │                   [ Save ]  [ Delete ]  │
└────────────────┴────────────────────────────────────────┘
```

- `[+]` prompts for a name and creates `~/.yapflows/knowledge/{name}.md`
- Right panel: document title · last edited timestamp · `MarkdownEditor` · Save · Delete

---

### 9.6 Memory (`/memory?topic={name}`)

```
┌────────────────┬────────────────────────────────────────┐
│ Memory   [↺][+]│  default                          [nav]│
│ ─────────────  │  Last edited: today 09:15              │
│▶ default       │  ──────────────────────────────────    │
│  work-projects │                                        │
│  recipes       │  ┌──────────────────────────────────┐  │
│  reading-list  │  │ User prefers dark mode.          │  │
│                │  │ Works at Acme Corp.              │  │
│                │  │ Timezone: Europe/Berlin          │  │
│                │  │ …                                │  │
│                │  └──────────────────────────────────┘  │
│                │                            [ Save ]     │
└────────────────┴────────────────────────────────────────┘
```

- `default` always at the top of the list
- `[+]` creates a new topic file (prompts for topic name)
- Right panel: topic name · `MarkdownEditor` · Save
- No Delete on `default`; other topic files have Delete

Identical component structure to Knowledge — same `TwoPaneLayout` + `MarkdownEditor`.

---

### 9.7 Tasks (`/tasks?id={name}`)

```
┌────────────────┬────────────────────────────────────────┐
│ Tasks   [↺][+] │  daily-standup                    [nav]│
│ ─────────────  │  ● enabled  ·  next run: tomorrow 09:00│
│▶ daily-standup │  ──────────────────────────────────    │
│  heartbeat ⟳  │  Agent      Assistant                   │
│  weekly-review │  Cron       0 9 * * 1-5  (weekdays 9am)│
│                │  Prompt     Generate my daily standup…  │
│                │  Session    new each run                │
│                │                                        │
│                │  [ Run now ]  [ Edit ]  [ Disable ]     │
│                │                                        │
│                │  Recent runs                           │
│                │  ⟳ running now…               → chat  │
│                │  ✓ today 09:00      2m 13s  → chat     │
│                │  ✓ yesterday 09:00  1m 58s  → chat     │
│                │  ✗ Mon 09:00        failed  → chat     │
└────────────────┴────────────────────────────────────────┘
```

- Left panel: task list; currently running task shows a ⟳ spinner icon
- Right panel: task definition summary + action buttons + run history
- Top of run history shows in-flight run as `⟳ running now…` with link to live session
- Each completed run row: status icon · timestamp · duration · link to the chat session
- Edit opens an inline form to change cron, prompt, model, sticky_session
- "Run now" enqueues a `TaskRun` immediately; disables the button while already queued

---

### 9.8 Skills (`/skills?id={name}`)

```
┌────────────────┬────────────────────────────────────────┐
│ Skills     [↺] │  daily-standup                    [nav]│
│ ─────────────  │  ~/.yapflows/skills/daily-standup/     │
│▶ daily-standup │  ──────────────────────────────────    │
│  git-summary   │                                        │
│  (built-in)    │  skill.md                              │
│  web-search    │  ┌──────────────────────────────────┐  │
│                │  │ ## Daily Standup                 │  │
│                │  │                                  │  │
│                │  │ Generates a standup report…      │  │
│                │  │ Usage: run scripts/run.sh        │  │
│                │  └──────────────────────────────────┘  │
│                │                                        │
│                │  Files: scripts/run.sh  assets/…       │
└────────────────┴────────────────────────────────────────┘
```

- No `[+]` — skills are created by writing files in `~/.yapflows/skills/{name}/`
- `[↺]` refreshes the list from disk
- Built-in skills (from `backend/skills/`) shown with a `(built-in)` badge
- Right panel: skill name · resolved path · `skill.md` content (read-only) · file list

---

### 9.9 Settings (`/settings`)

No two-pane layout — single scrollable form.

```
┌─────────────────────────────────────────────────────────┐
│ Settings                                           [nav] │
│ ──────────────────────────────────────────────────────  │
│                                                          │
│  Providers                                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │ OpenRouter API key  [●●●●●●●●●●●●]  [ Test ]      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Integrations                                            │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Telegram bot token  [not configured]               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Keyboard                                                │
│  Leader key  [ \ ]                                       │
│                                                          │
│  Logging                                                 │
│  Log level   [ INFO ▼ ]   Keep last [ 30 ] files        │
│                                                          │
│  Paths                                                   │
│  Data dir    [ ~/.yapflows ]                             │
│                                                          │
│                                          [ Save ]        │
└─────────────────────────────────────────────────────────┘
```

---

### 9.10 Hotkeys Reference (`\ + k`)

Modal overlay, shown on top of whatever is currently active.

```
┌─────────────────────────────────────┐
│  Keyboard Shortcuts             [×] │
│  ───────────────────────────────    │
│  \ + 1   New chat                   │
│  \ + 2   Chats                      │
│  \ + 3   Agents                     │
│  \ + 4   Knowledge                  │
│  \ + 5   Memory                     │
│  \ + 6   Tasks                      │
│  \ + 7   Skills                     │
│  \ + 8   Settings                   │
│  \ + `   Toggle sidebar             │
│  \ + k   This reference             │
│  j / k   Navigate list              │
│  ↵       Open selected              │
│  esc     Close / cancel             │
└─────────────────────────────────────┘
```

---

### 9.11 URL Routing

Every view has a URL that reflects the selected item. Always auto-selects on load.

| Route                     | Auto-select on load    |
|---------------------------|------------------------|
| `/setup`                  | — (redirected here on first run; no shell/nav) |
| `/`                       | —                      |
| `/chats?id={id}`          | Most recent session    |
| `/agents?id={id}`         | First agent            |
| `/knowledge?id={name}`    | First document         |
| `/memory?topic={name}`    | `default`              |
| `/tasks?id={name}`        | First task             |
| `/skills?id={name}`       | First skill            |
| `/settings`               | —                      |

`?id=` drives the highlighted item and detail pane. Navigating the list updates the URL
shallow (no reload). Bookmarking a URL restores the exact view.

---

### 9.11 Shared Components (DRY)

| Component          | Used in                                                      |
|--------------------|--------------------------------------------------------------|
| `TwoPaneLayout`    | Chats, Agents, Knowledge, Memory, Tasks, Skills              |
| `SidebarPanel`     | **All** left panels — wraps header + filter/search + ItemList |
| `ItemList`         | Session list, agent list, doc list, topic list, task list, skill list |
| `MarkdownEditor`   | Knowledge, Memory, Agent prompt viewer                       |
| `DetailPanel`      | Right pane wrapper in every two-pane tab                     |
| `EmptyState`       | Empty list or nothing selected                               |
| `NavIcon`          | Every nav rail button                                        |

#### Standardized `SidebarPanel`

**Every** left panel in the app follows this exact structure — no exceptions:

```
┌──────────────────────────┐
│ [Title]    [↺]  [+]      │  ← header row: title + refresh + create
│ ──────────────────────── │
│ [filter bar if needed]   │  ← optional filter tabs (e.g. Active/Archived/Scheduled)
│ ──────────────────────── │
│  Item one           [⋯] │  ← each row: label + hover actions menu
│  Item two           [⋯] │
│  ...                     │
└──────────────────────────┘
```

**Header:**
- `[Title]` — section name
- `[↺]` — refresh list from disk (always present)
- `[+]` — create new item (always present; disabled with tooltip for built-in-only sections)

**Row hover actions (`[⋯]` menu):**

| Section   | Actions available                          |
|-----------|--------------------------------------------|
| Chats     | Rename · Pin/Unpin · Archive · Delete      |
| Agents    | New chat · Delete (user agents only)       |
| Knowledge | Rename · Delete                            |
| Memory    | Rename · Delete (not on `default`)         |
| Tasks     | Run now · Enable/Disable · Delete          |
| Skills    | (view only — files managed externally)     |

All item creation happens via a simple name-prompt dialog (`[+]` button).
For agents: creates `~/.yapflows/agents/{name}.md` with default front matter.
For knowledge/memory: creates `~/.yapflows/{knowledge,memory}/{name}.md`.
For tasks: opens an inline form (cron, prompt, agent, model).
Underlying storage is always **files** — the UI writes files, nothing else.

---

### 9.12 Keyboard Shortcuts

Leader key configurable in Settings (default `\`):

| Keys        | Action           |
|-------------|------------------|
| `\ + 1`     | New chat         |
| `\ + 2`     | Chats            |
| `\ + 3`     | Agents           |
| `\ + 4`     | Knowledge        |
| `\ + 5`     | Memory           |
| `\ + 6`     | Tasks            |
| `\ + 7`     | Skills           |
| `\ + 8`     | Settings         |
| `\ + k`     | Hotkeys modal    |
| `\ + \``    | Toggle sidebar   |
| `j` / `k`   | Navigate list    |
| `↵`         | Open selected    |
| `esc`       | Close / cancel   |

---

### 9.13 Chat Autocomplete

Triggered inline in the composer:

| Prefix  | Completes        | Effect                                                         |
|---------|------------------|----------------------------------------------------------------|
| `/`     | Commands         | `/skills` — lists available skills in chat                     |
| `@`     | Memory topics    | Appends `~/.yapflows/memory/{topic}.md` content to the message |
| `#`     | Knowledge docs   | Appends `~/.yapflows/knowledge/{name}.md` content to the message |

When a `@` or `#` reference is confirmed, a chip appears in the composer showing which
file will be attached. The content is appended to the outgoing message text.

### 9.14 Responsive Design
The app is designed **desktop-first**. Mobile is not a v1 target.
However, all layout components (`TwoPaneLayout`, `SidebarPanel`, `NavIcon`, etc.)
use responsive Tailwind classes so the app degrades gracefully on smaller screens.
The left panel collapses automatically on narrow viewports.
This keeps a future mobile pass minimal — no architecture changes required.

---

## 10. Setup Wizard

### 10.1 Purpose
A guided onboarding flow that:
- Runs automatically on **first launch** (fresh install, no settings yet)
- Can be re-run at any time via a "Re-run setup" link in Settings
- Configures providers, tests connections, and seeds the user's memory

### 10.2 First-Run Detection
The server exposes `GET /setup/status` → `{ "required": bool }`.

"Required" is true when `~/.yapflows/settings.json` does not exist or no provider has
been successfully tested. The frontend checks this on load; if `required: true`, it
navigates to `/setup` before rendering the normal shell.

### 10.3 Layout
`/setup` is a **full-page route** — no nav rail, no left panel. Just a centered
step-by-step wizard. It is the only route that bypasses the normal shell.

### 10.4 Steps

**Step 1 — Welcome**

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│               Welcome to Yapflows                        │
│                                                          │
│   A lightweight, self-hosted personal AI assistant.      │
│   Let's get you set up in a few steps.                   │
│                                                          │
│                   [ Get started → ]                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Step 2 — Providers**

Test and configure each provider. At least one must pass before continuing.

```
┌─────────────────────────────────────────────────────────┐
│  Step 1 of 3: Providers                                  │
│                                                          │
│  Claude CLI                                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Runs `claude` as a subprocess (no API key)      │   │
│  │  [ Test connection ]   ● Connected               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  OpenRouter  (optional)                                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │  API key  [sk-or-v1-…………………………]  [ Test ]       │   │
│  │                             ○ Not configured      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│                              [ Next → ]                  │
└─────────────────────────────────────────────────────────┘
```

Connection tests:
- **claude-cli**: runs `claude --version`; if exit 0 → connected
- **openrouter**: makes a minimal API call with the provided key; saves key on success

**Step 3 — About You**

A few plain questions whose answers are written directly into
`~/.yapflows/memory/default.md` to give the agent a head start.
All fields are optional.

```
┌─────────────────────────────────────────────────────────┐
│  Step 2 of 3: About you                                  │
│                                                          │
│  The assistant will use this to personalise responses.   │
│  You can edit or extend it later in the Memory tab.      │
│                                                          │
│  Your name      [ Julian                     ]           │
│  Timezone       [ Europe/Berlin ▼            ]           │
│  What you do    [ Software engineer          ]           │
│  Preferences    [ I prefer concise answers.  ]           │
│                 [                            ]           │
│                                                          │
│  ← Back                          [ Next → ]              │
└─────────────────────────────────────────────────────────┘
```

Timezone is auto-detected from the browser and shown pre-filled.
"Preferences" is a free-text area for anything else (communication style,
language, recurring context, etc.).

The answers are formatted and written to `~/.yapflows/memory/default.md`.
If the file already exists, the wizard shows its current contents and allows
editing (re-run scenario).

**Step 4 — Done**

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                 You're all set                           │
│                                                          │
│   ● Claude CLI connected                                 │
│   ● Memory seeded                                        │
│                                                          │
│                 [ Start chatting → ]                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

Navigates to `/` (new chat) on click.

### 10.5 API

| Endpoint                    | Purpose                                          |
|-----------------------------|--------------------------------------------------|
| `GET  /setup/status`        | `{ "required": bool }` — first-run check         |
| `POST /setup/test-provider` | Test a provider connection; returns `{ "ok": bool, "error": str \| null }` |
| `POST /setup/complete`      | Write settings + seed memory; marks setup done  |

### 10.6 Re-running Setup
Settings tab includes a "Re-run setup wizard →" link at the bottom.
Re-running pre-fills all fields from current settings + existing memory.
Provider tests can be re-run without resetting anything else.

---

## 11. Logging

### 11.1 Log Files
A new log file is created **every time the server starts**, named by timestamp:

```
~/.yapflows/log/
├── 2026-03-01_143022.log
├── 2026-03-01_091544.log
└── 2026-02-28_200133.log
```

Old files are cleaned up on startup — keep the last 30 by default (configurable in settings).

### 11.2 Log Format
Human-readable and grep-friendly. Fixed-width columns, key=value pairs for context:

```
2026-03-01 14:30:22.123  INFO   [server]     Started                  host=localhost port=8000
2026-03-01 14:30:22.456  INFO   [server]     Agents loaded            count=3
2026-03-01 14:30:22.789  INFO   [scheduler]  Tasks registered         count=2
2026-03-01 14:30:25.001  INFO   [session]    Created                  id=sess-abc agent=assistant provider=claude-cli model=claude-opus-4-5
2026-03-01 14:30:25.789  INFO   [provider]   Run started              session=sess-abc
2026-03-01 14:30:30.456  INFO   [provider]   Run done                 session=sess-abc duration=4.7s
2026-03-01 14:31:00.000  INFO   [scheduler]  Task fired               task=daily-standup run=run-abc123
2026-03-01 14:31:00.002  INFO   [queue]      Run started              run=run-abc123 queue_depth=0
2026-03-01 14:33:14.567  INFO   [queue]      Run done                 run=run-abc123 duration=2m14s session=sess-xyz
2026-03-01 14:35:01.234  ERROR  [provider]   Run failed               session=sess-def error="subprocess exited with code 1"
Traceback (most recent call last):
  ...
```

### 11.3 What Gets Logged

| Component    | Level  | Events logged                                                      |
|--------------|--------|--------------------------------------------------------------------|
| `server`     | INFO   | Start, shutdown, config loaded, agents/tasks registered            |
| `session`    | INFO   | Created, message received, archived, deleted                       |
| `provider`   | INFO   | Run started, run done (with duration), run failed (with traceback) |
| `provider`   | DEBUG  | Each text chunk, token counts                                      |
| `tool`       | INFO   | Tool called (name + input), tool result (output summary)           |
| `scheduler`  | INFO   | Task fired, next run time                                          |
| `queue`      | INFO   | Run enqueued, run started, run done/failed (with duration)         |
| `trigger`    | INFO   | Trigger received, dispatched to session                            |
| `memory`     | DEBUG  | File read, file written, compact triggered                         |
| `knowledge`  | DEBUG  | File read, file written                                            |

Errors always include the full traceback regardless of log level.

### 11.4 Log Level
Configurable in `~/.yapflows/settings.json` (`"log_level": "INFO"`).
Default: `INFO`. Set to `DEBUG` to see chunk-level provider traffic and memory access.

### 11.5 Console Output
In development (`make dev`), logs are also written to stdout with colour.
In production, stdout is suppressed — file only.

---

## 12. Non-Functional Requirements
- Self-hostable, no external database (all file-based)
- Real-time WebSocket streaming
- Docker-ready (single container); `GET /health` returns `{"status": "ok"}` for health checks
- Makefile-based build system (zero install overhead)
- Python 3.11+ backend, Node 18+ frontend
