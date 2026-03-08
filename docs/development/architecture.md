# Architecture

## The core principle

Everything in Yapflows is defined as clean Python objects. The UI, the HTTP API, the WebSocket, the scheduler, and scripts all work with the same domain objects. There is no "backend magic" separate from the UI — you can assemble and run a full conversation in plain Python with no HTTP involved.

## Layer diagram

```
┌─────────────────────────────────────────────────┐
│              core/   (domain model)              │
│  Agent · Provider · Session · Message           │
│  Event · Task · Trigger · Skill                 │
└────────┬──────────────────────┬──────────────────┘
         │                      │
   ┌─────▼──────┐        ┌──────▼──────┐
   │  service/  │        │  providers/ │
   │  (logic)   │        │  (runners)  │
   └─────┬──────┘        └──────┬──────┘
         │                      │
   ┌─────▼──────────────────────▼──────┐
   │        api/   (thin adapters)     │
   │     HTTP routes · WebSocket       │
   └───────────────────────────────────┘
         │
   ┌─────▼──────┐
   │  frontend  │
   │  (Next.js) │
   └────────────┘
```

`core/` is a standalone library. Nothing in it imports FastAPI, WebSocket, or any HTTP concern. `api/` is a thin adapter layer: it deserializes HTTP/WebSocket input into domain objects, calls `core/` and `service/`, and serializes the results back out.

## Domain objects

### Data models vs. domain classes

Two distinct layers keep objects clean and testable:

**Data models** are pure Pydantic structures — serializable, no behaviour, no I/O. These are what gets saved to disk and sent over the wire: `AgentConfig`, `SessionState`, `Message`, `ToolCall`, `TaskConfig`, `TaskRun`, `TriggerConfig`, `SkillConfig`.

**Domain classes** are real Python classes with `__init__`, methods, and injected dependencies. These contain all behaviour and are independently testable: `Agent`, `Session`, `Task`, `Trigger`, `Skill`.

## Session representation: three layers

```
SessionState  →  Session (domain)  →  SessionView
(disk / wire)    (runtime logic)       (UI rendering)
```

| Layer | Purpose |
|-------|---------|
| `SessionState` | Storage and wire format. Contains raw `Message` and `ToolCall` objects. Saved to `~/.yapflows/chats/`. |
| `Session` | Runtime logic — `send()`, persistence, history management. |
| `SessionView` | Frontend contract. No storage detail, no provider-specific shapes. Produced by `SessionView.from_state()`. |

`SessionView.from_state()` is the single place that knows how to translate storage into display format — formatting tool inputs as readable summaries, computing durations, attaching agent metadata. The frontend never sees `SessionState` directly.

## Provider abstraction

`BaseProvider` is an abstract class with a single `run()` method. It receives a system prompt, conversation history, and user message. It yields a stream of `Event` objects.

Two concrete implementations ship with Yapflows:

**ClaudeCliProvider** runs `claude -p` as a subprocess. Multi-turn conversation is managed via the `--resume` flag using a `cli_session_id` stored in `SessionState`. The first turn gets a new session ID; subsequent turns resume it.

**OpenRouterProvider** uses the Strands Agents SDK to call models via the OpenRouter API. It passes the full normalised message history on each call and maps Strands' tool results into the shared `ToolCall` format.

Swapping providers requires no changes to `Session`, `Task`, or any other domain object — the `BaseProvider` interface is the only contract.

## Dependency injection

Every domain class receives its dependencies via `__init__`. No global state, no singletons:

| Dependency | Injected into | Can be swapped in tests with |
|-----------|---------------|------------------------------|
| `BaseProvider` | `Session` | `MockProvider` |
| `SessionStore` | `Session`, `Task`, `Trigger` | `MemorySessionStore` |
| `Config` | all factories | `Config(base_dir=tmp_path)` |
| `memory_dir: Path` | `Agent` | any `tmp_path` |

This makes every object independently testable without a running server, real provider, or filesystem.

## System prompt assembly

The system prompt sent to the model on each turn is assembled from:

1. The agent's body text (system prompt from the markdown file)
2. The contents of `~/.yapflows/memory/default.md` (if it exists)
3. Framework instructions: memory conventions, knowledge conventions, and the list of available skills with their paths

Topic memory files and knowledge documents are not included automatically. The agent reads them on demand via bash when it decides they are relevant.

## Events as the streaming protocol

`Event` is the single protocol between provider, service, API, and frontend. Whether running in a script or streaming over WebSocket, the same event types flow through the system:

- `TextChunkEvent` — a fragment of the assistant's response
- `ToolStartEvent` — an agent tool call has begun (OpenRouter only)
- `ToolDoneEvent` — a tool call completed with its output (OpenRouter only)
- `DoneEvent` — the agent turn is complete
- `ErrorEvent` — an error occurred

The WebSocket layer JSON-serializes these and forwards them to the browser. The frontend assembles them into the rendered conversation view.

`SessionIdEvent` is an internal-only event type used by `ClaudeCliProvider` to communicate the new `cli_session_id` back to `Session.send()`. It is never forwarded to the frontend.

## Task execution

Tasks are processed by a single background queue — one run at a time, no concurrency. This eliminates race conditions and keeps resource usage predictable.

APScheduler fires on cron expressions and places a `TaskRun` on the queue. "Run now" places a run on the back of the same queue. The background worker processes runs sequentially, updating the run record's status at each stage.

## File-based storage

All user data is files. No database. This has consequences throughout the design:

- Sessions are JSON files in `~/.yapflows/chats/`
- Agent, task, and trigger definitions are markdown files with YAML front matter
- Memory and knowledge are plain markdown
- Settings is a single JSON file

`SessionStore`, `Agent.load()`, `Task.load()`, and similar factory methods handle the file I/O. Swapping to a different storage backend would require only reimplementing these classes — no changes to the domain logic.
