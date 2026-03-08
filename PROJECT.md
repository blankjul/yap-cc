# Yapflows — Project

## Tech Stack

### Backend
- **Python 3.11+**, FastAPI, Uvicorn, WebSockets
- **Providers**: subprocess (`claude -p`) + OpenRouter API via Strands SDK
- **Scheduler**: APScheduler (async)
- **Browser**: Playwright (optional, openrouter provider only)
- **Deps**: see `backend/pyproject.toml`

### Frontend
- **TypeScript**, Next.js (App Router), React 19
- **UI**: shadcn/ui + Radix UI primitives
- **Styling**: Tailwind CSS v4
- **Markdown**: react-markdown, remark-gfm, rehype-highlight
- **Animations**: motion
- **Deps**: see `frontend/package.json`

### Build
- **GNU Make** — universal, pre-installed on macOS/Linux
- `scripts/detect-python.sh` — auto-detects Python 3.11+
- `npm run *` delegates to `make *` for consistency

---

## Architecture: The Coding Layer

The central principle: **everything is defined as clean Python objects**.
The UI, the HTTP API, the WebSocket, scripts, and scheduled tasks all work
with the same domain objects. There is no "backend magic" separate from the UI —
you can assemble and run a full conversation in plain Python with no HTTP involved.

```
┌─────────────────────────────────────────────────┐
│                  core/  (domain model)           │
│   Agent  ·  Provider  ·  Session  ·  Message    │
│   Event  ·  Task  ·  Trigger                    │
└────────┬──────────────────────┬──────────────────┘
         │                      │
   ┌─────▼──────┐        ┌──────▼──────┐
   │  service/  │        │  providers/ │
   │  (logic)   │        │  (runners)  │
   └─────┬──────┘        └──────┬──────┘
         │                      │
   ┌─────▼──────────────────────▼──────┐
   │          api/  (thin adapters)    │
   │       HTTP routes · WebSocket     │
   └───────────────────────────────────┘
         │
   ┌─────▼──────┐
   │  frontend  │
   │  (Next.js) │
   └────────────┘
```

### Running a conversation in pure Python

```python
from yapflows.core import Agent, Session, MemorySessionStore, Config

config  = Config.load()
agent   = Agent.load("assistant", config)   # provider + model come from agent front matter
store   = MemorySessionStore()
session = Session.new(agent=agent, store=store)

async for event in session.send("What's on my plate today?"):
    print(event)

# Override model at session creation:
session = Session.new(agent=agent, store=store, model="anthropic/claude-haiku-4-5")
```

The UI does exactly this — it just wraps it in HTTP and WebSocket.

---

## Domain Objects (`core/`)

Two distinct layers keep objects clean and testable:

1. **Data models** — pure Pydantic, serializable, no behaviour. These are what gets saved to disk and sent over the wire.
2. **Domain classes** — real Python classes with `__init__`, methods, and injected dependencies. These contain all behaviour and are independently testable.

---

### Data Models (`core/models.py`)

Pure Pydantic. No logic, no I/O. Serialized to/from JSON on disk and over WebSocket.

```python
class AgentConfig(BaseModel):
    id: str                                  # file stem
    name: str                                # display name (front matter or id)
    provider_id: Literal["claude-cli", "openrouter"]
    model: str                               # default model (overridable at session start)
    color: str = "#6366f1"
    avatar_url: str | None = None
    system_prompt: str                       # body of .md, front matter stripped

class ToolCall(BaseModel):
    """Normalized tool call — same shape regardless of which provider produced it."""
    id: str
    tool: str
    input: dict
    output: str | None = None      # None while in-flight
    error: str | None = None
    started_at: datetime
    completed_at: datetime | None = None

class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str                   # full text content (assembled from chunks on completion)
    tool_calls: list[ToolCall] = []  # empty for claude-cli; populated for openrouter
    timestamp: datetime

class SessionState(BaseModel):
    id: str
    title: str                                         # auto-set from first user message (~60 chars)
    agent_id: str
    provider_id: Literal["claude-cli", "openrouter"]  # resolved from agent at creation
    model: str                                         # resolved from agent, may be overridden
    messages: list[Message] = []
    sticky: bool = False
    source: Literal["manual", "scheduled", "trigger"] = "manual"
    created_at: datetime
    updated_at: datetime
    cli_session_id: str | None = None  # claude-cli: returned by first `--output-format json` call;
                                       # passed as `--resume` on subsequent turns

# --- Rendering layer ---

class ToolCallView(BaseModel):
    """UI representation of one tool call — formatted for display."""
    id: str
    tool: str
    input_summary: str             # short human-readable description of input
    output_summary: str | None     # short human-readable description of output
    status: Literal["running", "done", "error"]
    duration_ms: int | None

class MessageView(BaseModel):
    """UI representation of one message — provider-independent."""
    role: Literal["user", "assistant"]
    content: str                   # markdown-ready text
    tool_calls: list[ToolCallView] = []
    timestamp: datetime

class SessionView(BaseModel):
    """Everything the frontend needs to render a conversation. No storage details."""
    id: str
    title: str
    agent: AgentConfig             # name, color, avatar for the header
    model: str
    sticky: bool
    source: Literal["manual", "scheduled", "trigger"]
    messages: list[MessageView]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_state(cls, state: SessionState, agent: AgentConfig) -> SessionView:
        """Convert storage format → UI format. All provider-specific detail normalised here."""
        ...

class TaskConfig(BaseModel):
    name: str                                # file stem
    cron: str
    agent_id: str                            # provider resolved from agent
    model: str | None = None                 # None → use agent's default
    prompt: str                              # body of .md, front matter stripped
    enabled: bool = True
    sticky_session: bool = False

class TaskRun(BaseModel):
    id: str
    task_name: str
    status: Literal["pending", "running", "done", "failed"]
    scheduled_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    session_id: str | None = None            # session created for this run
    error: str | None = None

class TriggerConfig(BaseModel):
    name: str                                # file stem
    agent_id: str                            # provider resolved from agent
    model: str | None = None                 # None → use agent's default
    prompt_template: str                     # body of .md; {{payload}} interpolated at dispatch

class SkillConfig(BaseModel):
    id: str                                  # directory name
    description: str                         # first paragraph of skill.md
    path: Path

class SetupStatus(BaseModel):
    required: bool                           # True when settings.json absent or no provider tested

class ProviderTestResult(BaseModel):
    ok: bool
    error: str | None = None
```

---

### Events (`core/events.py`)

The single streaming protocol — same objects in scripts, tests, and over WebSocket.

```python
class TextChunkEvent(BaseModel):
    type: Literal["text_chunk"] = "text_chunk"
    content: str

class ToolStartEvent(BaseModel):
    type: Literal["tool_start"] = "tool_start"
    tool: str
    input: dict

class ToolDoneEvent(BaseModel):
    type: Literal["tool_done"] = "tool_done"
    tool: str
    output: str

class DoneEvent(BaseModel):
    type: Literal["done"] = "done"

class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str

class SessionIdEvent(BaseModel):
    """Internal only — not forwarded to frontend. Carries the new cli_session_id
    from ClaudeCliProvider so Session.send() can update SessionState."""
    type: Literal["session_id"] = "session_id"
    cli_session_id: str

Event = TextChunkEvent | ToolStartEvent | ToolDoneEvent | DoneEvent | ErrorEvent | SessionIdEvent
```

---

### `BaseProvider` — ABC (`core/provider.py`)

The extension point. Swap implementations without touching anything else.

```python
class BaseProvider(ABC):
    """Runs a single model turn and yields streaming events."""

    provider_id: ClassVar[str]

    def __init__(self, model: str) -> None:
        self.model = model

    @abstractmethod
    async def run(
        self,
        system_prompt: str,
        history: list[Message],
        message: str,
        cli_session_id: str | None = None,   # claude-cli only; ignored by openrouter
    ) -> AsyncIterator[Event]: ...
    # Yields events. For claude-cli, the FIRST event is a special SessionIdEvent
    # carrying the new cli_session_id so Session.send() can persist it.

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(model={self.model!r})"
```

Concrete implementations:

```python
class ClaudeCliProvider(BaseProvider):
    provider_id = "claude-cli"
    # Multi-turn conversation via `--resume`:
    #   First turn:  claude -p "msg" --output-format json
    #                → parse session_id from JSON response
    #                → caller stores it in SessionState.cli_session_id
    #   Later turns: claude -p "msg" --resume <cli_session_id> --output-format stream-json \
    #                  --verbose --include-partial-messages
    #                → claude-cli maintains conversation history internally
    #
    # run() signature receives cli_session_id (may be None for first turn)
    # and returns new cli_session_id so Session.send() can update SessionState.

class OpenRouterProvider(BaseProvider):
    provider_id = "openrouter"
    def __init__(self, model: str, api_key: str) -> None: ...
    # Uses Strands Agents SDK.
    # Strands manages its own conversation state internally (strands.Agent object).
    # We pass the full normalized history on each call; Strands handles tool dispatch.
    # Tool results are mapped to normalized ToolCall objects before yielding events.

class MockProvider(BaseProvider):
    """For tests — returns scripted responses without any I/O."""
    provider_id = "mock"
    def __init__(self, responses: list[str]) -> None: ...
    async def run(self, ...) -> AsyncIterator[Event]:
        for chunk in self.responses:
            yield TextChunkEvent(content=chunk)
        yield DoneEvent()
```

---

### `Agent` (`core/agent.py`)

Loads config from disk and builds the system prompt. Injected into `Session`.

```python
class Agent:
    def __init__(self, config: AgentConfig, memory_dir: Path) -> None:
        self.config = config
        self._memory_dir = memory_dir

    # --- factories ---

    @classmethod
    def load(cls, name: str, config: Config) -> Agent:
        """Resolve user agent → built-in agent, parse front matter."""
        ...

    @classmethod
    def list(cls, config: Config) -> list[Agent]:
        """All discoverable agents (user overrides built-ins)."""
        ...

    # --- behaviour ---

    def build_system_prompt(self, skills: list[SkillConfig] = []) -> str:
        """Assemble: agent prompt + default memory + instructions."""
        ...

    # --- properties (delegates to config) ---
    @property
    def id(self) -> str: return self.config.id
    @property
    def name(self) -> str: return self.config.name
```

---

### `Session` (`core/session.py`)

The core runtime object. Takes an `Agent` and `BaseProvider` — both injectable.

```python
class Session:
    def __init__(
        self,
        state: SessionState,
        agent: Agent,
        provider: BaseProvider,
        store: SessionStore,
    ) -> None:
        self.state = state
        self.agent = agent
        self.provider = provider
        self._store = store

    # --- factories ---

    @classmethod
    def new(
        cls,
        agent: Agent,
        store: SessionStore,
        source: str = "manual",
        model: str | None = None,        # overrides agent's default model if given
    ) -> Session:
        """Provider is resolved from agent.config.provider_id; model defaults to agent.config.model."""
        ...

    @classmethod
    def load(cls, session_id: str, store: SessionStore, config: Config) -> Session: ...

    # --- behaviour ---

    async def send(self, message: str) -> AsyncIterator[Event]:
        """Append user message, call provider, stream events, append reply."""
        system_prompt = self.agent.build_system_prompt()
        async for event in self.provider.run(system_prompt, self.state.messages, message):
            yield event
        self._store.save(self.state)

    def archive(self) -> None: ...

    # --- properties ---
    @property
    def id(self) -> str: return self.state.id
    @property
    def messages(self) -> list[Message]: return self.state.messages
```

---

### `SessionStore` (`core/session.py`)

Persistence abstraction — swap disk for memory in tests.

```python
class SessionStore(ABC):
    @abstractmethod
    def save(self, state: SessionState) -> None: ...
    @abstractmethod
    def load(self, session_id: str) -> SessionState: ...
    @abstractmethod
    def list(self) -> list[SessionState]: ...
    @abstractmethod
    def archive(self, session_id: str) -> None: ...
    @abstractmethod
    def restore(self, session_id: str) -> None: ...   # moves from archive/ back to chats/
    @abstractmethod
    def delete(self, session_id: str) -> None: ...    # permanent delete from either location

class FileSessionStore(SessionStore):
    """Reads/writes ~/.yapflows/chats/{id}.json"""
    def __init__(self, chats_dir: Path, archive_dir: Path) -> None: ...

class MemorySessionStore(SessionStore):
    """In-memory store for tests — no disk I/O."""
    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
```

---

### `Task` and `Trigger` (`core/task.py`, `core/trigger.py`)

Thin wrappers around config that add a `run()` method.

```python
class Task:
    def __init__(self, config: TaskConfig, agent: Agent, store: SessionStore) -> None: ...

    def enqueue(self, queue: asyncio.Queue, scheduled_at: datetime | None = None) -> TaskRun:
        """Create a TaskRun (status: pending), persist to disk, push onto queue.
        Called by APScheduler on cron fire, or directly for manual 'Run now'."""
        run = TaskRun(
            id=new_id(),
            task_name=self.config.name,
            status="pending",
            scheduled_at=scheduled_at or datetime.now(),
        )
        run.save()           # written to ~/.yapflows/runs/{id}.json immediately
        queue.put_nowait(run)
        return run

    async def execute(self, run: TaskRun) -> None:
        """Called by the background worker. Runs the session, updates run status."""
        ...

    @classmethod
    def load(cls, name: str, config: Config) -> Task: ...
    @classmethod
    def list(cls, config: Config) -> list[Task]: ...

### `TaskQueue` (`service/queue.py`)

Single background worker. Started once at server startup, runs for the lifetime of the process.

```python
class TaskQueue:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[TaskRun] = asyncio.Queue()

    def enqueue(self, run: TaskRun) -> None:
        self._queue.put_nowait(run)

    async def worker(self, tasks: dict[str, Task]) -> None:
        """Runs forever. Processes one TaskRun at a time."""
        while True:
            run = await self._queue.get()
            task = tasks[run.task_name]
            await task.execute(run)
            self._queue.task_done()
```

APScheduler calls `task.enqueue(queue)` on cron fire.
The "Run now" API endpoint calls `task.enqueue(queue)` directly.
The worker processes them sequentially — no concurrency, no race conditions.

---

class Trigger:
    def __init__(self, config: TriggerConfig, agent: Agent, store: SessionStore) -> None: ...

    async def dispatch(self, payload: str) -> Session:
        """Interpolate prompt_template and send to sticky session.
        Agent provides provider; config.model overrides agent default if set."""
        ...
```

---

### `Skill` (`core/skill.py`)

```python
class Skill:
    def __init__(self, config: SkillConfig) -> None:
        self.config = config

    @classmethod
    def load(cls, name: str, config: Config) -> Skill: ...
    @classmethod
    def list(cls, config: Config) -> list[Skill]: ...

    def read_instructions(self) -> str:
        """Returns contents of skill.md — injected into system prompt."""
        return (self.config.path / "skill.md").read_text()
```

---

### Testing Each Object in Isolation

Because every dependency is injected, each object can be tested without a running server,
without a real provider, and without touching the filesystem.

```python
# Test Agent.build_system_prompt() — no disk I/O needed
def test_agent_prompt_includes_memory(tmp_path):
    (tmp_path / "default.md").write_text("User likes dark mode.")
    config = AgentConfig(id="test", name="Test", system_prompt="You are helpful.")
    agent = Agent(config, memory_dir=tmp_path)
    prompt = agent.build_system_prompt()
    assert "User likes dark mode." in prompt

# Test Session.send() — no real provider, no subprocess
async def test_session_collects_events():
    provider = MockProvider(responses=["Hello", " world"])
    store    = MemorySessionStore()
    agent    = Agent(AgentConfig(id="a", name="A", system_prompt=""), memory_dir=Path("/dev/null"))
    session  = Session.new(agent=agent, provider=provider, store=store)
    events   = [e async for e in session.send("Hi")]
    assert events[-1].type == "done"
    assert len(session.messages) == 2   # user + assistant appended

# Test FileSessionStore independently
def test_file_store_roundtrip(tmp_path):
    store = FileSessionStore(chats_dir=tmp_path / "chats", archive_dir=tmp_path / "archive")
    state = SessionState(id="s1", title="Test", ...)
    store.save(state)
    assert store.load("s1") == state

# Test MockProvider — scripted output, no network
async def test_mock_provider_yields_done():
    provider = MockProvider(responses=["ok"])
    events = [e async for e in provider.run("sys", [], "hello")]
    assert isinstance(events[-1], DoneEvent)
```

---

## Project Structure

```
yapflows/
├── backend/
│   ├── src/
│   │   ├── server.py                 # FastAPI app, startup/shutdown
│   │   ├── config.py                 # Config class, settings.json I/O
│   │   ├── logging_config.py         # New timestamped log file on each start, console in dev
│   │   │
│   │   ├── core/                     # ← domain model (the coding layer)
│   │   │   ├── models.py             #   All data models (AgentConfig, SessionState, Message, ToolCall, …)
│   │   │   ├── views.py              #   Rendering layer (SessionView, MessageView, ToolCallView)
│   │   │   ├── events.py             #   Event union type (streaming protocol)
│   │   │   ├── agent.py              #   Agent domain class
│   │   │   ├── provider.py           #   BaseProvider ABC
│   │   │   ├── session.py            #   Session domain class + SessionStore ABC
│   │   │   ├── task.py               #   Task domain class
│   │   │   ├── trigger.py            #   Trigger domain class
│   │   │   └── skill.py              #   Skill domain class
│   │   │
│   │   ├── providers/                # Provider implementations
│   │   │   ├── claude_cli.py         #   claude -p subprocess, JSONL stream
│   │   │   └── openrouter.py         #   Strands SDK + OpenRouter API
│   │   │
│   │   ├── service/                  # Business logic (uses core objects)
│   │   │   ├── memory.py             #   System prompt assembly, memory file I/O
│   │   │   ├── scheduler.py          #   APScheduler setup; creates TaskRuns; runs worker loop
│   │   │   ├── queue.py              #   asyncio.Queue + single background worker
│   │   │   └── triggers.py           #   Trigger registry + dispatch
│   │   │
│   │   ├── api/                      # Thin HTTP + WebSocket adapters
│   │   │   ├── routes/
│   │   │   │   ├── agents.py
│   │   │   │   ├── sessions.py
│   │   │   │   ├── memory.py
│   │   │   │   ├── knowledge.py
│   │   │   │   ├── tasks.py
│   │   │   │   ├── skills.py          #   GET /skills, GET /skills/{name}
│   │   │   │   ├── triggers.py
│   │   │   │   └── setup.py           #   /setup/status, /setup/test-provider, /setup/complete
│   │   │   └── websocket/
│   │   │       ├── handlers.py       #   WS endpoint, message loop
│   │   │       └── manager.py        #   Connection pool, broadcast
│   │   │
│   │   └── tools/                    # Strands @tool functions (openrouter only)
│   │       ├── __init__.py           #   Tool registry
│   │       ├── bash.py               #   Shell execution
│   │       └── browser.py            #   Playwright
│   │
│   ├── agents/                       # Built-in agent definitions
│   │   └── assistant.md              # Front matter: name/color/avatar; body: system prompt
│   ├── skills/                       # Built-in skill definitions
│   │   └── {name}/
│   │       ├── skill.md              # Skill description + agent usage instructions
│   │       ├── scripts/
│   │       └── assets/
│   ├── tests/
│   └── pyproject.toml
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Home — new chat
│   │   ├── shell.tsx                 # Main layout, keyboard shortcuts, routing
│   │   ├── setup/page.tsx            # Full-page wizard, no shell wrapper
│   │   ├── chats/page.tsx            # ?id={session_id}
│   │   ├── agents/page.tsx           # ?id={agent_id}
│   │   ├── knowledge/page.tsx        # ?id={name}
│   │   ├── memory/page.tsx           # ?topic={name}
│   │   ├── tasks/page.tsx            # ?id={name}
│   │   ├── skills/page.tsx           # ?id={name}
│   │   └── settings/page.tsx
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives (copy from yapflow_old)
│   │   ├── chat/                     # Chat bubble components (copy from yapflow_old)
│   │   │   ├── UserBubble.tsx
│   │   │   ├── AgentBubble.tsx
│   │   │   ├── ToolCallStrip.tsx
│   │   │   └── WritingIndicator.tsx
│   │   ├── shared/                   # Shared primitives reused across all tabs
│   │   │   ├── TwoPaneLayout.tsx     #   List | Detail split (copy from yapflow_old)
│   │   │   ├── SidebarPanel.tsx      #   Standardized left panel: header + [↺][+] + ItemList
│   │   │   ├── ItemList.tsx          #   Generic selectable list (j/k nav, URL sync, [⋯] actions)
│   │   │   ├── MarkdownEditor.tsx    #   View/edit markdown (memory, knowledge, agents)
│   │   │   ├── DetailPanel.tsx       #   Right-pane wrapper
│   │   │   └── EmptyState.tsx        #   Empty list / nothing selected
│   │   ├── ChatInterface.tsx         # Chat composer + message list
│   │   ├── SessionPanel.tsx          # Left sidebar session list
│   │   ├── NavIcon.tsx               # Nav rail icon (copy from yapflow_old)
│   │   ├── AgentsTab.tsx
│   │   ├── KnowledgeTab.tsx
│   │   ├── MemoryTab.tsx
│   │   ├── TasksTab.tsx
│   │   ├── SkillsTab.tsx
│   │   ├── SettingsTab.tsx
│   │   └── HotkeysTab.tsx
│   ├── hooks/
│   │   ├── use-chat-websocket.ts     # (copy from yapflow_old, adapt event types)
│   │   ├── use-resizable-panel.ts    # (copy from yapflow_old)
│   │   ├── use-selected-id.ts        # Sync ?id= param ↔ list selection
│   │   └── ...
│   ├── lib/
│   │   └── keyboard-shortcuts.ts     # Leader-key system (copy from yapflow_old)
│   └── package.json
│
├── scripts/
│   └── detect-python.sh
├── Makefile
├── package.json
├── REQUIREMENTS.md
└── PROJECT.md
```

---

## User Data Directory (`~/.yapflows/`)

```
~/.yapflows/
├── settings.json               # All config (server, providers, UI, logging)
├── agents/                     # User-defined agents (override built-ins)
│   └── my-agent.md             # Front matter: name/color/avatar (optional); body: system prompt
├── memory/
│   ├── default.md              # Auto-loaded in every conversation
│   ├── work-projects.md        # Topic file — loaded on demand by agent
│   └── {topic}.md              # Any topic file — never auto-loaded
├── knowledge/
│   └── {name}.md               # Knowledge documents — loaded on demand
├── chats/
│   └── {session_id}.json       # Active sessions (serialized Session objects)
├── archive/
│   └── {session_id}.json       # Archived sessions
├── tasks/
│   └── {name}.md               # Front matter: cron/agent/model/enabled/sticky_session; body: prompt
├── runs/
│   └── {id}.json               # TaskRun records (machine-generated, one per execution)
├── triggers/
│   └── {name}.md               # Front matter: agent/model; body: prompt_template ({{payload}})
├── skills/                     # User-defined skills (override built-ins)
│   └── {name}/
│       ├── skill.md            # Description + agent usage instructions (required)
│       ├── scripts/            # Executables the agent calls via bash
│       └── assets/             # Supporting files
├── log/
└── data/
```

Agents, tasks, and triggers are markdown files with YAML front matter — human-authored,
readable, and editable in any text editor. Sessions and runs are JSON — machine-generated
structured records. Load domain objects with `Session.load(id)`, `Task.load(name)`, etc.

---

## Key Architectural Decisions

### Coding Layer First

`core/` is a standalone library. Nothing in it imports FastAPI, WebSocket, or any HTTP concern.
It can be used in scripts, tests, and the scheduler exactly like any Python library.

`api/` is a thin adapter: deserializes HTTP/WS input into domain objects, calls `core/` and
`service/`, and serializes `Event` objects back out.

### Session Representation: Three Layers

```
SessionState   →   Session (domain)   →   SessionView
(disk / wire)      (runtime logic)        (UI rendering)
```

| Layer | Type | Purpose |
|---|---|---|
| `SessionState` | Pydantic data model | Storage and wire format. Contains raw `Message` + `ToolCall` objects. Saved to `~/.yapflows/chats/`. |
| `Session` | Domain class | Runtime logic — `send()`, persistence, history management. |
| `SessionView` | Pydantic data model | Frontend contract. Produced by `SessionView.from_state()`. No storage detail, no provider-specific shapes. Sent over HTTP and WebSocket. |

`SessionView.from_state()` is the single place that knows how to translate storage → display:
- Formats `ToolCall.input` as a human-readable summary
- Computes `duration_ms` from timestamps
- Attaches `AgentConfig` (name, color, avatar) for the chat header
- Normalises tool call status

The frontend never touches `SessionState` directly. It only ever receives `SessionView` objects.
Streaming uses `Event` objects (text chunks, tool events) which the frontend appends into the view live.

### Provider-Independent Message Format

`Message` and `ToolCall` are stored in a normalised format — no Strands types, no claude-cli-specific shapes.
Each provider implementation is responsible for mapping its own output into these types before yielding events.
`claude-cli` always produces `tool_calls: []`. `openrouter` populates `ToolCall` from Strands tool results.

### Dependency Injection Over Globals

Every domain class receives its dependencies via `__init__`. No global state, no singletons,
no `config.get_instance()`. This is what makes individual objects testable in isolation:

| Dependency | Injected into | Swapped in tests with |
|---|---|---|
| `BaseProvider` | `Session` | `MockProvider` |
| `SessionStore` | `Session`, `Task`, `Trigger` | `MemorySessionStore` |
| `Config` | factories (`Agent.load`, `Task.load`, …) | `Config(base_dir=tmp_path)` |
| `memory_dir: Path` | `Agent` | `tmp_path` from pytest |

### Data Models vs. Domain Classes

| Layer | What it is | Example |
|---|---|---|
| Data model | Pydantic `BaseModel`, serializable | `AgentConfig`, `SessionState`, `Message` |
| Domain class | Python class with behaviour and injected deps | `Agent`, `Session`, `Task` |

Data models travel over the wire and to disk. Domain classes run the logic.
Convert between them with `Session.state` (data out) and `Session.load(id, store)` (data in).

### System Prompt Assembly

```
{agent system_prompt}
────────────────────
{~/.yapflows/memory/default.md, if exists}
────────────────────
[Instructions: memory/@topic, knowledge/#name, bash conventions,
 available skills list with paths]
```

Assembled by `service/memory.py` before each `provider.run()` call.
Skills are listed by name and path so the agent can `cat skill.md` and invoke scripts via bash.

### Events Are the Protocol

`Event` is the single protocol between provider, service, API, and UI.
Whether you're running in a script or streaming over WebSocket, you get the same
`TextChunkEvent`, `ToolStartEvent`, `DoneEvent`, etc.
The WebSocket layer just JSON-serializes them and forwards.

### Sticky Sessions

`Session.sticky: bool`. `SessionPanel` pins sticky sessions at the top.
Set by: user action (pin button), scheduler (`sticky_session: true`), or trigger dispatch.

### Trigger Dispatch

```
External event → triggers.py → Session.load_or_create(sticky=True) → session.send() → events
```

---

## Logging

### Setup (`logging_config.py`)

Called once at server startup before anything else.

```python
def configure_logging(config: Config) -> None:
    log_dir = config.base_dir / "log"
    log_dir.mkdir(exist_ok=True)

    # Clean up old log files — keep last N
    existing = sorted(log_dir.glob("*.log"))
    for old in existing[: -config.log_keep]:
        old.unlink()

    # New file for this server run
    filename = datetime.now().strftime("%Y-%m-%d_%H%M%S") + ".log"
    log_file = log_dir / filename

    # File handler — always active
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(YapflowsFormatter())

    # Console handler — dev only
    handlers = [file_handler]
    if config.dev_mode:
        handlers.append(logging.StreamHandler())   # coloured via colorlog

    logging.basicConfig(level=config.log_level, handlers=handlers)
```

### Logger Names

Each module gets its own named logger — consistent with the `[component]` column in log lines:

| Logger name          | Used in                              |
|----------------------|--------------------------------------|
| `yapflows.server`    | `server.py`                          |
| `yapflows.session`   | `core/session.py`                    |
| `yapflows.provider`  | `providers/claude_cli.py`, `openrouter.py` |
| `yapflows.tool`      | `tools/bash.py`, `browser.py`        |
| `yapflows.scheduler` | `service/scheduler.py`               |
| `yapflows.queue`     | `service/queue.py`                   |
| `yapflows.trigger`   | `service/triggers.py`                |
| `yapflows.memory`    | `service/memory.py`                  |

```python
# In every module:
log = logging.getLogger(__name__)   # e.g. "yapflows.session"

# Usage:
log.info("Created  id=%s agent=%s provider=%s", session.id, agent.id, agent.config.provider_id)
log.error("Run failed  session=%s error=%s", session.id, err, exc_info=True)
```

### Log Format

```python
class YapflowsFormatter(logging.Formatter):
    FMT = "{asctime}  {levelname:<6} [{name:<12}] {message}"
    # asctime  → "2026-03-01 14:30:22.123"
    # name     → module suffix after "yapflows." e.g. "session"
    # message  → free text with key=value context appended
```

---

## What to Borrow from `yapflow_old`

### Frontend — copy with minimal changes
| File | Notes |
|------|-------|
| `lib/keyboard-shortcuts.ts` | Keep as-is |
| `components/ui/` | All shadcn primitives — keep as-is |
| `components/chat/` | All bubble components — keep as-is |
| `components/NavIcon.tsx` | Keep as-is |
| `components/TwoPaneLayout.tsx` | Move to `shared/`, keep as-is |
| `hooks/use-resizable-panel.ts` | Keep as-is |
| `hooks/use-chat-websocket.ts` | Keep, adapt to new Event union type |
| `app/shell.tsx` | Adapt nav sections + add URL routing |
| `components/ChatInterface.tsx` | Adapt to new Event types |
| `components/SessionPanel.tsx` | Add sticky pin section + URL sync |

### Backend — adapt
| File | Notes |
|------|-------|
| `config.py` | Keep Config pattern, update schema |
| `websocket/handlers.py` | Keep WS + background task pattern |
| `service/scheduler.py` | Keep APScheduler approach |
| `tools/browser.py` | Keep as-is |
| `Makefile` | Keep build system, update targets |

### New in This Version
| File | Notes |
|------|-------|
| `core/` | Entire domain model layer — new |
| `providers/claude_cli.py` | Replaces old agent.py |
| `providers/openrouter.py` | New |
| `service/memory.py` | Formalized memory + system prompt assembly |
| `service/triggers.py` | New trigger dispatch |
| `tools/bash.py` | Replaces filesystem + system + web tools |
| `core/skill.py` | Skill domain object |
| `components/shared/ItemList.tsx` | Generic list shared across all tabs |
| `components/shared/MarkdownEditor.tsx` | Shared markdown viewer/editor |
| `components/shared/EmptyState.tsx` | Shared empty state |
| `components/MemoryTab.tsx` | New |
| `components/SkillsTab.tsx` | New |
| `components/shared/SidebarPanel.tsx` | New — standardized sidebar with header + refresh + create |
| `hooks/use-selected-id.ts` | URL ?id= sync hook |
| `app/*/page.tsx` | Route pages per section |

---

## Development Setup

```bash
make venv        # Create Python venv
make install     # Install all dependencies (Python + Node)
make dev         # Start backend + frontend concurrently
make test        # Run backend tests
make build       # Build frontend for production
make start       # Serve production build (built frontend served by backend)
make kill        # Kill processes on ports 8000 and 3000
make clean       # Remove build artifacts
```

Required env vars (or in `~/.yapflows/settings.json`):
- `OPENROUTER_API_KEY` — only if using openrouter provider
- `TELEGRAM_BOT_TOKEN` — only if using Telegram integration
