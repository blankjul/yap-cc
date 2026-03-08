# Contributing

## Getting set up

Follow the [setup guide](../installation/setup.md) to get a development instance running. The short version:

```bash
git clone https://github.com/yourname/yapflows.git
cd yapflows
make install
make dev
```

`make dev` starts both the backend (port 8000) and the frontend (port 3000) with live reload. Backend changes reload automatically via Uvicorn's `--reload` flag. Frontend changes are picked up by Next.js.

## Make targets

| Command | What it does |
|---------|-------------|
| `make install` | Install Python + Node dependencies |
| `make dev` | Start backend + frontend concurrently with live reload |
| `make test` | Run backend tests with pytest |
| `make build` | Build the frontend for production |
| `make start` | Serve the production build (frontend served by the backend) |
| `make kill` | Kill processes on ports 8000 and 3000 |
| `make clean` | Remove build artifacts and caches |
| `make venv` | Create the Python virtual environment only |
| `make docs` | Preview the documentation site locally |

## Running tests

```bash
make test
```

Tests live in `backend/tests/`. The test suite uses `pytest` and `pytest-asyncio`. Most tests are unit tests of individual domain objects — no running server required.

The test design philosophy: every domain class receives its dependencies via `__init__`, so tests inject mock or in-memory dependencies directly. No patching, no complex fixtures.

Key test utilities available:

- `MockProvider` — returns scripted responses without any I/O or network calls
- `MemorySessionStore` — in-memory session storage with no disk access
- `Config(base_dir=tmp_path)` — isolated config pointing to a temporary directory

## Project structure

```
yapflows/
├── backend/
│   ├── src/
│   │   ├── core/         Domain model (Agent, Session, Task, Trigger, Skill, events)
│   │   ├── providers/    Provider implementations (ClaudeCliProvider, OpenRouterProvider)
│   │   ├── service/      Business logic (scheduler, queue, memory assembly, triggers)
│   │   ├── api/          FastAPI routes and WebSocket handlers
│   │   └── tools/        Strands @tool functions (bash, browser — OpenRouter only)
│   ├── agents/           Built-in agent definitions
│   ├── skills/           Built-in skill definitions
│   ├── environments/     Built-in environment presets
│   └── tests/
└── frontend/
    ├── app/              Next.js App Router pages
    ├── components/       React components
    ├── hooks/            Custom React hooks
    └── lib/              Utilities (API client, keyboard shortcuts, types)
```

See [Architecture](architecture.md) for a detailed explanation of each layer.

## Adding a new provider

1. Create `backend/src/providers/{name}.py`
2. Implement `BaseProvider` — define `provider_id` and `async def run(...) -> AsyncIterator[Event]`
3. Register the provider in the provider factory
4. Add a built-in environment in `backend/environments/{id}.json` with `provider_id` set to your new provider's ID
5. Write tests using `MockProvider` as a reference for what the interface should return

The rest of the system — sessions, tasks, triggers, the frontend — requires no changes. Provider is resolved by ID at session creation time.

## Adding a new built-in agent

Create a markdown file at `backend/agents/{name}.md` with YAML front matter (at minimum `provider` and `model`). It will appear in the Agents tab for all users as a built-in agent.

## Adding a new built-in skill

Create a directory at `backend/skills/{name}/` with a `skill.md` file. It will appear in the Skills tab and be listed in every agent's system prompt automatically.

## Frontend development

The frontend is a Next.js app using the App Router. Each section of the app has its own page component in `frontend/app/{section}/page.tsx`.

Shared components live in `frontend/components/shared/`. These are the building blocks used across all tabs:

- `TwoPaneLayout` — split list/detail layout
- `SidebarPanel` — standardised left panel with refresh and create buttons
- `ItemList` — generic selectable list with keyboard navigation and URL sync
- `MarkdownEditor` — markdown view/edit with save
- `EmptyState` — shown when a list is empty or nothing is selected

Follow the existing patterns when adding a new tab or section. Every tab uses `TwoPaneLayout` and `SidebarPanel`.

## Logging

Use the named logger for your module — `logging.getLogger(__name__)`. This keeps log output consistent with the `[component]` column format.

Log at `INFO` for significant events (session created, task fired, run completed). Use `DEBUG` for high-frequency or low-level events (text chunks, memory reads). Always include `exc_info=True` on error logs so the traceback is captured.

See [Configuration](../installation/configuration.md) for log format details and the log file location.
