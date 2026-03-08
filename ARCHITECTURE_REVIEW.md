# Yapflows Architecture Review

**Date:** 2026-03-08
**Reviewer:** Code Analysis
**Overall Grade:** B+ (7.5/10)

## Executive Summary

Yapflows is a well-architected AI agent orchestration platform with clean separation of concerns and strong type safety. However, there are critical code quality issues that need attention:

- **500+ lines of duplicated code** in frontend tab components
- **Production-breaking hardcoded port** in WebSocket connection
- **Design pattern violations** preventing extensibility
- **Missing pagination** on API endpoints
- **No caching strategy** leading to excessive API calls

---

## 1. Critical Issues (Must Fix)

### 🔴 1.1 Hardcoded WebSocket Port

**Location:** `frontend/hooks/use-chat-websocket.ts:87`

```typescript
const ws = new WebSocket(
  `${protocol}//${window.location.hostname}:8000/ws/${sessionId}`
)
```

**Problem:** Port 8000 is hardcoded, breaking production deployments where backend may run on different ports.

**Fix:**
```typescript
const ws = new WebSocket(
  `${protocol}//${window.location.host}/ws/${sessionId}`
)
```

**Impact:** High - Blocks production deployment

---

### 🔴 1.2 Massive Tab Component Duplication

**Affected Files:**
- `frontend/components/AgentsTab.tsx` (381 lines)
- `frontend/components/MemoryTab.tsx` (273 lines)
- `frontend/components/KnowledgeTab.tsx` (~280 lines)
- `frontend/components/TasksTab.tsx` (~450 lines)
- `frontend/components/SkillsTab.tsx` (~300 lines)

**Duplicated Pattern (appears in ALL tabs):**

```typescript
// State management (identical across all tabs)
const [items, setItems] = useState<T[]>([])
const [selected, setSelected] = useState<T | null>(null)
const [draft, setDraft] = useState<T | null>(null)
const [loading, setLoading] = useState(false)
const [saving, setSaving] = useState(false)
const [creating, setCreating] = useState(false)
const [newName, setNewName] = useState("")

// Load pattern (identical)
const loadItems = async () => {
  setLoading(true)
  try {
    const list = await api.listXxx()
    setItems(list)
    if (!selectedId && list.length > 0) {
      setSelectedId(list[0].id)
    }
  } catch (err) {
    toastError(err instanceof Error ? err.message : "Failed to load")
  } finally {
    setLoading(false)
  }
}

// Save pattern (identical)
const handleSave = async () => {
  if (!draft || !selected) return
  setSaving(true)
  try {
    const updated = await api.updateXxx(selected.id, draft)
    setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    setSelected(updated)
    setDraft({ ...updated })
    toast.success("Saved")
  } catch (err) {
    toastError(err instanceof Error ? err.message : "Failed to save")
  } finally {
    setSaving(false)
  }
}

// Delete pattern (identical)
const handleDelete = async (id: string) => {
  try {
    await api.deleteXxx(id)
    const remaining = items.filter((a) => a.id !== id)
    setItems(remaining)
    if (selectedId === id) {
      if (remaining.length > 0) {
        setSelectedId(remaining[0].id)
      } else {
        router.push("/xxx", { scroll: false })
      }
    }
    toast.success("Deleted")
  } catch (err) {
    toastError(err instanceof Error ? err.message : "Failed to delete")
  }
}

// Create pattern (identical)
const commitCreate = async () => {
  const name = newName.trim()
  setCreating(false)
  setNewName("")
  if (!name) return
  try {
    const created = await api.createXxx({ name, ...defaults })
    await loadItems()
    setSelectedId(created.id)
    toast.success(`Created`)
  } catch (err) {
    toastError(err instanceof Error ? err.message : "Failed to create")
  }
}

// URL state sync (identical)
const setSelectedId = (id: string) => {
  const params = new URLSearchParams(searchParams.toString())
  params.set("id", id)
  router.push(`/xxx?${params.toString()}`, { scroll: false })
}
```

**Solution:** Create a generic CRUD hook

```typescript
// frontend/hooks/use-crud-resource.ts
interface CrudApi<T extends { id: string }> {
  list: () => Promise<T[]>
  get: (id: string) => Promise<T>
  create: (data: Partial<T>) => Promise<T>
  update: (id: string, data: Partial<T>) => Promise<T>
  delete: (id: string) => Promise<{ ok: boolean }>
}

interface UseCrudResourceOptions<T> {
  api: CrudApi<T>
  basePath: string
  createDefaults: () => Partial<T>
  resourceName: string
}

export function useCrudResource<T extends { id: string }>(
  options: UseCrudResourceOptions<T>
) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get("id")

  const [items, setItems] = useState<T[]>([])
  const [selected, setSelected] = useState<T | null>(null)
  const [draft, setDraft] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")

  // ... implement all the shared logic once ...

  return {
    items,
    selected,
    draft,
    setDraft,
    loading,
    saving,
    creating,
    newName,
    setNewName,
    selectedId,
    setSelectedId,
    loadItems,
    handleSave,
    handleDelete,
    startCreating,
    commitCreate,
  }
}
```

**Usage:**
```typescript
// AgentsTab.tsx
export function AgentsTab() {
  const crud = useCrudResource({
    api: api.agents,
    basePath: "/agents",
    createDefaults: () => ({
      name: "",
      system_prompt: "You are a helpful assistant.",
      color: "#6366f1",
    }),
    resourceName: "Agent",
  })

  // Now the component is just presentation logic
  return (
    <TwoPaneLayout
      sidebar={<Sidebar {...crud} />}
      main={<DetailView {...crud} />}
    />
  )
}
```

**Impact:**
- Reduces 500+ duplicate lines to ~100 shared lines
- Consistent behavior across all tabs
- Easier to add new CRUD features

---

### 🔴 1.3 Provider Selection Violates Open/Closed Principle

**Location:** `backend/src/core/session.py:241-248` and `session.py:265-272`

**Problem:** Provider instantiation is hardcoded in two places with if/elif chains:

```python
# In Session.new() - lines 241-248
if provider_id == "claude-cli":
    provider: "BaseProvider" = ClaudeCliProvider(model=model)
elif provider_id == "openrouter":
    api_key = (config.openrouter_api_key if config else "") or os.getenv("OPENROUTER_API_KEY", "")
    provider = OpenRouterProvider(model=model, api_key=api_key)
else:
    raise ValueError(f"Unknown provider: {provider_id}")

# In Session.load() - lines 265-272 (DUPLICATED!)
if state.provider_id == "claude-cli":
    provider: "BaseProvider" = ClaudeCliProvider(model=state.model)
elif state.provider_id == "openrouter":
    api_key = config.openrouter_api_key or os.getenv("OPENROUTER_API_KEY", "")
    provider = OpenRouterProvider(model=state.model, api_key=api_key)
else:
    raise ValueError(f"Unknown provider: {state.provider_id}")
```

**Solution:** Provider Registry Pattern

```python
# backend/src/providers/registry.py
from typing import Type, Dict
from ..core.provider import BaseProvider

class ProviderRegistry:
    """Registry for provider implementations."""

    _providers: Dict[str, Type[BaseProvider]] = {}

    @classmethod
    def register(cls, provider_id: str):
        """Decorator to register a provider."""
        def decorator(provider_class: Type[BaseProvider]):
            cls._providers[provider_id] = provider_class
            return provider_class
        return decorator

    @classmethod
    def create(cls, provider_id: str, model: str, config=None, **kwargs) -> BaseProvider:
        """Factory method to create provider instances."""
        if provider_id not in cls._providers:
            raise ValueError(f"Unknown provider: {provider_id}")

        provider_class = cls._providers[provider_id]

        # Handle provider-specific configuration
        if provider_id == "openrouter":
            import os
            api_key = kwargs.get("api_key") or (
                config.openrouter_api_key if config else ""
            ) or os.getenv("OPENROUTER_API_KEY", "")
            return provider_class(model=model, api_key=api_key)

        return provider_class(model=model, **kwargs)

# backend/src/providers/claude_cli.py
from .registry import ProviderRegistry

@ProviderRegistry.register("claude-cli")
class ClaudeCliProvider(BaseProvider):
    # ... implementation ...

# backend/src/providers/openrouter.py
@ProviderRegistry.register("openrouter")
class OpenRouterProvider(BaseProvider):
    # ... implementation ...

# Now in Session.new() and Session.load():
provider = ProviderRegistry.create(provider_id, model=model, config=config)
```

**Benefits:**
- Adding new providers doesn't require modifying Session class
- No code duplication between `new()` and `load()`
- Providers self-register on import
- Follows Open/Closed Principle

**Impact:** Enables easy extension with custom providers

---

### 🔴 1.4 Missing API Pagination

**Problem:** All `list_*` endpoints return full arrays without pagination.

**Affected Endpoints:**
- `GET /api/sessions` - Will fail with 10,000+ sessions
- `GET /api/agents` - Less critical but still needed
- `GET /api/tasks` - Less critical
- `GET /api/memory` - Less critical
- `GET /api/knowledge` - Less critical

**Example Current Implementation:**
```python
@router.get("/sessions")
async def list_sessions(request: Request) -> list[SessionView]:
    config = request.app.state.config
    store = request.app.state.store
    states = store.list()  # Returns ALL sessions
    return [SessionView.from_state(state, config) for state in states]
```

**Solution:** Add pagination parameters

```python
@router.get("/sessions")
async def list_sessions(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    archived: bool | None = Query(None),
) -> dict:
    config = request.app.state.config
    store = request.app.state.store

    # Filter
    states = store.list()
    if archived is not None:
        states = [s for s in states if s.archived == archived]

    # Paginate
    total = len(states)
    paginated = states[offset:offset + limit]

    return {
        "items": [SessionView.from_state(s, config) for s in paginated],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
```

**Frontend update:**
```typescript
// lib/api.ts
listSessions: (opts?: { limit?: number; offset?: number; archived?: boolean }) => {
  const params = new URLSearchParams()
  if (opts?.limit) params.set("limit", opts.limit.toString())
  if (opts?.offset) params.set("offset", opts.offset.toString())
  if (opts?.archived !== undefined) params.set("archived", opts.archived.toString())
  return req<{ items: SessionView[]; total: number }>(
    "GET",
    `/api/sessions?${params.toString()}`
  )
}
```

**Impact:** Prevents OOM errors and performance degradation at scale

---

## 2. High Priority Issues

### 🟡 2.1 Config Singleton Makes Testing Difficult

**Location:** `backend/src/config.py:152-166`

```python
# Module-level singleton
_config: Config | None = None

def get_config(base_dir: Path | str | None = None) -> Config:
    global _config
    if _config is None:
        _config = Config(base_dir)
    return _config
```

**Problem:**
- Can't run tests in parallel (shared global state)
- Tests can't use different configs
- Need to call `reset_config()` between tests

**Solution:** Dependency injection

```python
# Remove get_config() singleton entirely
# Instead, instantiate Config in server.py and pass it explicitly

# server.py
async def startup():
    config = Config()  # Create instance
    app.state.config = config

# In route handlers, always use request.app.state.config
# In tests, create fresh Config instances per test
```

**Impact:** Enables parallel testing, cleaner test isolation

---

### 🟡 2.2 Store Instantiation Duplication

**Location:**
- `backend/src/server.py:86`
- `backend/src/api/websocket/handlers.py:42` (unnecessary)
- `backend/src/api/routes/sessions.py:269` (unnecessary)

**Problem:** `FileSessionStore` instantiated 3 times instead of using `request.app.state.store`

```python
# In server.py (CORRECT)
_store = FileSessionStore(chats_dir=_config.chats_dir)
app.state.store = _store

# In handlers.py:42 (WRONG - creates duplicate instance)
from ...core.session import FileSessionStore
_store = FileSessionStore(chats_dir=_config.chats_dir)

# In routes/sessions.py:269 (WRONG - creates duplicate instance)
_store = FileSessionStore(chats_dir=config.chats_dir)
```

**Fix:** Remove duplicate instantiations, always use app.state.store

```python
# handlers.py - Remove lines 42-43, use request.app.state.store
# sessions.py - Remove line 269, use request.app.state.store
```

**Impact:** Consistency, prevents potential data inconsistency bugs

---

### 🟡 2.3 No Global State Management in Frontend

**Problem:** Each tab independently fetches data, no caching

**Example:**
```typescript
// AgentsTab.tsx
const loadAgents = async () => {
  const list = await api.listAgents()  // Fetches from server
  setAgents(list)
}

// ChatInterface.tsx creates a session
const handleCreateSession = async () => {
  await api.createSession({ agent_id, environment_id })
  // AgentsTab doesn't know about this new session
  // User has to manually refresh
}
```

**Solution:** Add React Query for caching

```typescript
// hooks/use-agents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.listAgents(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<AgentConfig>) => api.createAgent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

// AgentsTab.tsx
const { data: agents, isLoading } = useAgents()
const createAgent = useCreateAgent()
```

**Benefits:**
- Automatic caching (no redundant API calls)
- Optimistic updates
- Automatic refetch on window focus
- Loading/error states handled automatically

**Impact:** Better UX, reduced server load

---

### 🟡 2.4 Session Class Violates Single Responsibility Principle

**Location:** `backend/src/core/session.py`

**Current Responsibilities:**
1. Conversation state management
2. Message streaming
3. Skill expansion (lines 361-374)
4. Summary generation (lines 300-350)
5. Provider interaction
6. State persistence

**Solution:** Extract services

```python
# core/skill_expander.py
class SkillExpander:
    def __init__(self, config: Config):
        self.config = config

    def expand(self, content: str) -> str:
        """Expand skill commands like /commit into full instructions."""
        if not content.startswith("/"):
            return content
        skill_name = content[1:].split()[0]
        try:
            from .skill import Skill
            skill = Skill.load(skill_name, self.config)
            return skill.read_instructions()
        except (KeyError, Exception):
            return content

# core/session.py
class Session:
    def __init__(
        self,
        state: SessionState,
        agent: Agent,
        provider: BaseProvider,
        store: SessionStore,
        config: Config,
        skill_expander: SkillExpander | None = None,
    ):
        # ...
        self._skill_expander = skill_expander or SkillExpander(config)

    async def send(self, content: str, ...):
        # Use injected service
        expanded = self._skill_expander.expand(content)
        # ...
```

**Impact:** Better testability, clearer separation of concerns

---

## 3. Code Quality Issues

### 3.1 Inconsistent Error Handling

**Pattern A (with HTTPException):**
```python
try:
    state = store.load(session_id)
except KeyError:
    raise HTTPException(status_code=404, detail="Session not found")
```

**Pattern B (propagate exception):**
```python
state = store.load(session_id)  # KeyError bubbles up
```

**Pattern C (generic catch):**
```typescript
try {
    await api.deleteSession(session_id)
} catch {
    toastError("Failed to delete session")
}
```

**Recommendation:** Standardize error responses

```python
# backend/src/api/errors.py
from fastapi import HTTPException

class NotFoundError(HTTPException):
    def __init__(self, resource: str, identifier: str):
        super().__init__(
            status_code=404,
            detail={"error": f"{resource} not found", "code": "NOT_FOUND", "id": identifier}
        )

# Usage
try:
    state = store.load(session_id)
except KeyError:
    raise NotFoundError("Session", session_id)
```

**Frontend:**
```typescript
// lib/api.ts
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new ApiError(res.status, data.error || data.detail, data.code)
  }
  return res.json()
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message)
  }
}
```

---

### 3.2 Duplicated Skill Expansion Logic

**Location:**
- `backend/src/core/session.py:361-374`
- `backend/src/api/websocket/handlers.py:138-154`

Identical code in two places. **Fix:** Use the SkillExpander service from 2.4 above.

---

### 3.3 Magic Numbers

**Examples:**
- `frontend/components/ChatInterface.tsx:32` - `SCROLL_NEAR_BOTTOM_PX = 120`
- `backend/src/providers/claude_cli.py:104` - `limit=8 * 1024 * 1024`
- `backend/src/api/websocket/handlers.py:59` - `timeout=30.0`

**Fix:** Extract to config constants

```python
# backend/src/constants.py
WS_KEEPALIVE_TIMEOUT = 30.0
SUBPROCESS_BUFFER_LIMIT = 8 * 1024 * 1024
```

---

## 4. Missing Patterns & Abstractions

### 4.1 Repository Pattern for Domain Objects

**Problem:** Domain classes (Agent, Task, Skill, Environment) all reimplement file loading

**Current Pattern (repeated 4 times):**
```python
@classmethod
def load(cls, name: str, config: Config) -> Self:
    path = config.agents_dir / f"{name}.json"
    if not path.exists():
        raise KeyError(f"Agent not found: {name}")
    return cls(config=AgentConfig.model_validate_json(path.read_text()))
```

**Solution:** Generic file repository

```python
# core/repository.py
from typing import TypeVar, Generic, Type
from pydantic import BaseModel
from pathlib import Path

T = TypeVar('T', bound=BaseModel)

class FileRepository(Generic[T]):
    """Generic file-based repository for Pydantic models."""

    def __init__(self, directory: Path, model_class: Type[T]):
        self.directory = directory
        self.model_class = model_class

    def load(self, name: str) -> T:
        path = self.directory / f"{name}.json"
        if not path.exists():
            raise KeyError(f"{self.model_class.__name__} not found: {name}")
        return self.model_class.model_validate_json(path.read_text())

    def save(self, name: str, obj: T) -> None:
        path = self.directory / f"{name}.json"
        path.write_text(obj.model_dump_json(indent=2))

    def list(self) -> list[T]:
        return [
            self.model_class.model_validate_json(p.read_text())
            for p in self.directory.glob("*.json")
        ]

    def delete(self, name: str) -> None:
        path = self.directory / f"{name}.json"
        if path.exists():
            path.unlink()

# Usage in Agent
class Agent:
    def __init__(self, config: AgentConfig):
        self.config = config

    @classmethod
    def _repository(cls, config: Config) -> FileRepository[AgentConfig]:
        return FileRepository(config.agents_dir, AgentConfig)

    @classmethod
    def load(cls, name: str, config: Config) -> "Agent":
        repo = cls._repository(config)
        return cls(config=repo.load(name))

    @classmethod
    def list(cls, config: Config) -> list["Agent"]:
        repo = cls._repository(config)
        return [cls(config=cfg) for cfg in repo.list()]
```

**Impact:** DRY, consistent file handling, easier to swap storage backends

---

### 4.2 Message Forwarding Logic Duplication

**Locations:**
- `backend/src/core/task.py:183-190`
- `backend/src/api/websocket/handlers.py:244-252`
- `backend/src/api/routes/sessions.py:125-137`

**Current Pattern:**
```python
from ...messaging.manager import get_external_chat_manager
messaging = get_external_chat_manager()
if messaging:
    await messaging.forward_last_response(session_state)
```

**Solution:** Session Event Handler

```python
# core/session_events.py
class SessionEventHandler:
    def __init__(self, config: Config, store: SessionStore, messaging_manager=None):
        self.config = config
        self.store = store
        self.messaging = messaging_manager

    async def on_message_complete(self, session_id: str):
        """Handle post-message tasks: forwarding, unread marking, etc."""
        state = self.store.load(session_id)

        # Forward to external chats
        if self.messaging:
            await self.messaging.forward_last_response(state)

        # Mark as unread if needed
        if state.external_chat:
            state.has_unread = True
            self.store.save(state)

    async def on_session_created(self, session_id: str):
        # Hook for session creation events
        pass

# Usage in routes/sessions.py
@router.post("/{session_id}/send")
async def send_message(session_id: str, content: str, request: Request):
    # ... send message logic ...

    event_handler = request.app.state.event_handler
    await event_handler.on_message_complete(session_id)
```

---

## 5. Dependency Analysis

### Current Dependencies

**Backend:**
- FastAPI (web framework)
- Pydantic (data validation)
- APScheduler (task scheduling)
- Playwright (browser automation)
- python-telegram-bot (messaging)
- strands-sdk (OpenRouter provider)

**Frontend:**
- Next.js 15 (framework)
- React 19 (UI library)
- TailwindCSS (styling)
- shadcn/ui (component library)
- Sonner (toasts)

### Missing Dependencies

**Backend:**
- **Testing:** pytest-asyncio (for async tests)
- **Monitoring:** sentry-sdk (error tracking)
- **Validation:** pydantic-settings (for Config)

**Frontend:**
- **State Management:** @tanstack/react-query (caching)
- **Error Boundaries:** react-error-boundary
- **Testing:** @testing-library/react, vitest

---

## 6. Performance Considerations

### 6.1 Frontend Bundle Size

**Current:** Not analyzed

**Recommendation:**
```bash
# Add bundle analyzer
npm install --save-dev @next/bundle-analyzer

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})
module.exports = withBundleAnalyzer({ ... })
```

### 6.2 Backend Memory Usage

**Concern:** All sessions loaded into memory on `store.list()`

**Current:**
```python
states = store.list()  # Loads ALL sessions into memory
```

**Fix:** Add streaming/pagination at store level

```python
class SessionStore(ABC):
    @abstractmethod
    def list_ids(self) -> list[str]:
        """Return only IDs, not full states."""
        ...

    @abstractmethod
    def list_paginated(self, limit: int, offset: int) -> list[SessionState]:
        """Return paginated results."""
        ...
```

---

## 7. Security Considerations

### 7.1 API Key Storage

**Current:** API keys stored in plaintext in `~/.yapflows/settings.json`

**Recommendation:** Add encryption option

```python
# config.py
import keyring

class Config:
    def get_api_key(self, provider: str) -> str:
        # Try keyring first (encrypted)
        key = keyring.get_password("yapflows", f"{provider}_api_key")
        if key:
            return key
        # Fall back to settings file
        return str(self.get(f"providers.{provider}.api_key", ""))

    def set_api_key(self, provider: str, key: str, use_keyring: bool = True):
        if use_keyring:
            keyring.set_password("yapflows", f"{provider}_api_key", key)
        else:
            self.set(f"providers.{provider}.api_key", key)
```

### 7.2 CORS Configuration

**Current:** Not explicitly configured

**Recommendation:** Add explicit CORS policy

```python
# server.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 8. Testing Gaps

### Current Coverage

**Backend Tests:**
- ✅ Unit tests for models
- ✅ Integration tests for providers
- ✅ Integration tests for server startup
- ❌ No route tests
- ❌ No WebSocket tests
- ❌ No session tests

**Frontend Tests:**
- ❌ None

### Recommended Test Structure

```
backend/tests/
├── unit/
│   ├── test_models.py ✅
│   ├── test_agent.py ✅
│   ├── test_session.py ✅
│   └── test_provider.py ✅
├── integration/
│   ├── test_api_routes.py ❌
│   ├── test_websocket.py ❌
│   └── test_end_to_end.py ❌
└── conftest.py ✅

frontend/tests/
├── components/
│   ├── ChatInterface.test.tsx ❌
│   └── AgentsTab.test.tsx ❌
├── hooks/
│   └── use-chat-websocket.test.ts ❌
└── lib/
    └── api.test.ts ❌
```

---

## 9. Documentation Gaps

**Missing:**
- API documentation (OpenAPI/Swagger)
- Architecture decision records (ADRs)
- Component storybook
- Deployment guide
- Contributing guide

**Recommendation:** Add OpenAPI docs

```python
# server.py
from fastapi import FastAPI

app = FastAPI(
    title="Yapflows API",
    description="AI Agent Orchestration Platform",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)
```

---

## 10. Action Plan

### Phase 1: Critical Fixes (Week 1)

1. ✅ Fix hardcoded WebSocket port
2. ✅ Add API pagination
3. ✅ Create `useCrudResource` hook
4. ✅ Refactor all tab components to use shared hook
5. ✅ Implement provider registry

**Estimated Impact:** -600 LOC, fixes production blocker

### Phase 2: High Priority (Week 2)

6. ✅ Remove config singleton, use DI
7. ✅ Remove duplicate store instantiations
8. ✅ Add React Query for caching
9. ✅ Extract Session responsibilities (SkillExpander, SessionEventHandler)
10. ✅ Standardize error handling

**Estimated Impact:** Better architecture, improved UX

### Phase 3: Code Quality (Week 3)

11. ✅ Implement repository pattern
12. ✅ Extract magic numbers to constants
13. ✅ Add error boundaries
14. ✅ Add OpenAPI documentation
15. ✅ Add security improvements (keyring, CORS)

**Estimated Impact:** Maintainability, security

### Phase 4: Testing (Week 4)

16. ✅ Add route integration tests
17. ✅ Add WebSocket tests
18. ✅ Add frontend component tests
19. ✅ Add E2E tests
20. ✅ Setup CI/CD

**Estimated Impact:** Confidence, regression prevention

---

## 11. Metrics to Track

### Code Quality Metrics

- **Lines of Code:** ~15,000 (estimated)
- **Duplication:** ~500 lines (3.3%)
- **Test Coverage:** <20% (estimated)
- **Cyclomatic Complexity:** Not measured

### After Refactoring Goals

- **Lines of Code:** ~14,400 (-4%)
- **Duplication:** <1%
- **Test Coverage:** >60%
- **Build Time:** <2 minutes
- **Bundle Size:** <500 KB (gzipped)

---

## 12. Conclusion

Yapflows has a **solid architectural foundation** with clean domain models and proper abstraction layers. The main issues are:

1. **Code duplication** in frontend components (easily fixable)
2. **Missing design patterns** (provider registry, repository) that limit extensibility
3. **Production deployment issue** (hardcoded port)
4. **No caching/optimization** leading to redundant API calls

**With focused refactoring effort (~4 weeks), the codebase can reach A-grade quality.**

### Strengths to Preserve

✅ Clean domain model
✅ Strong type safety
✅ Event-driven architecture
✅ Dependency injection in core logic
✅ Clear separation of concerns

### Critical Path

1. Fix WebSocket port (1 hour)
2. Create `useCrudResource` hook (4 hours)
3. Refactor tab components (8 hours)
4. Implement provider registry (4 hours)
5. Add pagination (4 hours)

**Total:** ~3 developer days for critical fixes

---

**End of Review**
