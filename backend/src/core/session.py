"""
Session domain class and SessionStore ABC.

Session: runtime logic (send messages, stream events, persist state).
SessionStore: persistence abstraction (swap FileSessionStore ↔ MemorySessionStore in tests).
"""

from __future__ import annotations

import logging
import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, AsyncIterator

if TYPE_CHECKING:
    from ..config import Config
    from .agent import Agent
    from .models import AgentConfig, ExternalChat, Message, SessionState
    from .events import Event
    from .provider import BaseProvider

log = logging.getLogger("yapflows.session")


class SessionStore(ABC):
    """Persistence abstraction for SessionState objects."""

    @abstractmethod
    def save(self, state: "SessionState") -> None: ...

    @abstractmethod
    def load(self, session_id: str) -> "SessionState": ...

    @abstractmethod
    def list(self) -> "list[SessionState]": ...

    @abstractmethod
    def archive(self, session_id: str) -> None: ...

    @abstractmethod
    def restore(self, session_id: str) -> None: ...

    @abstractmethod
    def delete(self, session_id: str) -> None: ...

    def get_main(self, main_session_id: "str | None") -> "SessionState | None":
        """Return the main session by ID, or None if not set / not found / archived."""
        if not main_session_id:
            return None
        try:
            state = self.load(main_session_id)
            return state if not state.archived else None
        except KeyError:
            return None


class MemorySessionStore(SessionStore):
    """In-memory store — no disk I/O. Use in tests."""

    def __init__(self) -> None:
        self._sessions: dict[str, "SessionState"] = {}

    def save(self, state: "SessionState") -> None:
        self._sessions[state.id] = state

    def load(self, session_id: str) -> "SessionState":
        if session_id not in self._sessions:
            raise KeyError(f"Session not found: {session_id}")
        return self._sessions[session_id]

    def list(self) -> "list[SessionState]":
        return list(self._sessions.values())

    def archive(self, session_id: str) -> None:
        state = self.load(session_id)
        state.archived = True
        self.save(state)

    def restore(self, session_id: str) -> None:
        state = self.load(session_id)
        state.archived = False
        self.save(state)

    def delete(self, session_id: str) -> None:
        if session_id in self._sessions:
            del self._sessions[session_id]


class FileSessionStore(SessionStore):
    """File-based store. Reads/writes ~/.yapflows/chats/{id}.json."""

    def __init__(self, chats_dir: Path) -> None:
        self._chats_dir = chats_dir
        self._chats_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, session_id: str) -> Path:
        return self._chats_dir / f"{session_id}.json"

    def save(self, state: "SessionState") -> None:
        import json
        path = self._path(state.id)
        # Atomic write via temp file
        tmp = path.with_suffix(".tmp")
        tmp.write_text(state.model_dump_json(indent=2))
        tmp.replace(path)

    def load(self, session_id: str) -> "SessionState":
        from .models import SessionState
        path = self._path(session_id)
        if not path.exists():
            raise KeyError(f"Session not found: {session_id}")
        return SessionState.model_validate_json(path.read_text())

    def list(self) -> "list[SessionState]":
        from .models import SessionState
        states = []
        for path in self._chats_dir.glob("*.json"):
            try:
                states.append(SessionState.model_validate_json(path.read_text()))
            except Exception as e:
                log.warning("Failed to load session %s: %s", path.name, e)
        return states

    def archive(self, session_id: str) -> None:
        state = self.load(session_id)
        state.archived = True
        self.save(state)

    def restore(self, session_id: str) -> None:
        state = self.load(session_id)
        state.archived = False
        self.save(state)

    def delete(self, session_id: str) -> None:
        path = self._path(session_id)
        if path.exists():
            path.unlink()


def _new_session_id() -> str:
    return uuid.uuid4().hex[:12]


def _auto_title(text: str, max_len: int = 60) -> str:
    """Generate a session title from the first user message."""
    title = text.strip().split("\n")[0]
    if len(title) > max_len:
        title = title[:max_len - 1] + "…"
    return title or "New conversation"


class Session:
    """Runtime object for a conversation. Wraps SessionState + Agent + Provider + Store."""

    def __init__(
        self,
        state: "SessionState",
        agent: "Agent",
        provider: "BaseProvider",
        store: SessionStore,
    ) -> None:
        self.state = state
        self.agent = agent
        self.provider = provider
        self._store = store

    # ── Factories ──────────────────────────────────────────────────────────────

    @classmethod
    def new(
        cls,
        agent: "Agent",
        store: SessionStore,
        config: "Config | None" = None,
        source: str = "manual",
        model: str | None = None,
        task_name: str | None = None,
        sticky: bool = False,
        title: str | None = None,
        external_chat: "ExternalChat | None" = None,
    ) -> "Session":
        """Create a new session. Provider and model resolved from agent config."""
        from .models import SessionState
        from ..providers.claude_cli import ClaudeCliProvider
        from ..providers.openrouter import OpenRouterProvider

        resolved_model = model or agent.config.model
        now = datetime.utcnow()

        state = SessionState(
            id=_new_session_id(),
            title=title or "New conversation",
            agent_id=agent.id,
            provider_id=agent.config.provider_id,
            model=resolved_model,
            source=source,  # type: ignore[arg-type]
            task_name=task_name,
            sticky=sticky,
            created_at=now,
            updated_at=now,
            external_chat=external_chat,
        )

        # Resolve provider
        if agent.config.provider_id == "claude-cli":
            provider: "BaseProvider" = ClaudeCliProvider(model=resolved_model)
        elif agent.config.provider_id == "openrouter":
            import os
            api_key = os.getenv("OPENROUTER_API_KEY") or (config.openrouter_api_key if config else "")
            provider = OpenRouterProvider(model=resolved_model, api_key=api_key)
        else:
            raise ValueError(f"Unknown provider: {agent.config.provider_id}")

        store.save(state)
        log.info("Created  id=%s agent=%s provider=%s model=%s",
                 state.id, agent.id, agent.config.provider_id, resolved_model)
        return cls(state=state, agent=agent, provider=provider, store=store)

    @classmethod
    def load(cls, session_id: str, store: SessionStore, config: "Config") -> "Session":
        """Load an existing session from the store."""
        from .agent import Agent
        from ..providers.claude_cli import ClaudeCliProvider
        from ..providers.openrouter import OpenRouterProvider

        state = store.load(session_id)
        agent = Agent.load(state.agent_id, config)

        if state.provider_id == "claude-cli":
            provider: "BaseProvider" = ClaudeCliProvider(model=state.model)
        elif state.provider_id == "openrouter":
            import os
            api_key = os.getenv("OPENROUTER_API_KEY") or config.openrouter_api_key
            provider = OpenRouterProvider(model=state.model, api_key=api_key)
        else:
            raise ValueError(f"Unknown provider: {state.provider_id}")

        return cls(state=state, agent=agent, provider=provider, store=store)

    # ── Behaviour ─────────────────────────────────────────────────────────────

    async def send(self, message: str) -> AsyncIterator["Event"]:
        """Append user message, call provider, stream events, save state."""
        from .models import Message, ToolCall
        from .events import (
            TextChunkEvent, ToolStartEvent, ToolDoneEvent,
            DoneEvent, ErrorEvent, SessionIdEvent,
        )

        now = datetime.utcnow()

        # Auto-set title from first user message (only if title wasn't explicitly set)
        if not self.state.messages and self.state.title == "New conversation":
            self.state.title = _auto_title(message)

        user_msg = Message(role="user", content=message, timestamp=now)
        self.state.messages.append(user_msg)

        # Assemble system prompt
        system_prompt = self.agent.build_system_prompt()

        # Build assistant message accumulator
        assistant_content = ""
        assistant_tool_calls: list[ToolCall] = []
        in_flight_tools: dict[str, ToolCall] = {}
        _had_tool_since_text = False  # insert separator when text resumes after a tool

        async def _gen():
            nonlocal assistant_content, _had_tool_since_text

            try:
                async for event in await self.provider.run(
                    system_prompt=system_prompt,
                    history=self.state.messages[:-1],  # exclude the new user msg
                    message=message,
                    cli_session_id=self.state.cli_session_id,
                ):
                    # Handle internal events
                    if isinstance(event, SessionIdEvent):
                        self.state.cli_session_id = event.cli_session_id
                        continue  # not forwarded to frontend

                    # Accumulate text — insert separator when resuming after tool calls
                    if isinstance(event, TextChunkEvent):
                        if _had_tool_since_text and assistant_content:
                            assistant_content += "\n\n"
                        assistant_content += event.content
                        _had_tool_since_text = False

                    # Track tool calls
                    elif isinstance(event, ToolStartEvent):
                        tc = ToolCall(
                            id=event.tool_call_id,
                            tool=event.tool,
                            input=event.input,
                            started_at=datetime.utcnow(),
                        )
                        in_flight_tools[event.tool_call_id] = tc
                        assistant_tool_calls.append(tc)

                    elif isinstance(event, ToolDoneEvent):
                        if event.tool_call_id in in_flight_tools:
                            tc = in_flight_tools.pop(event.tool_call_id)
                            tc.output = event.output
                            tc.error = event.error
                            tc.completed_at = datetime.utcnow()
                            if event.input:
                                tc.input = event.input
                        _had_tool_since_text = True

                    elif isinstance(event, DoneEvent):
                        # Finalize assistant message
                        assistant_msg = Message(
                            role="assistant",
                            content=assistant_content,
                            tool_calls=assistant_tool_calls,
                            timestamp=datetime.utcnow(),
                        )
                        self.state.messages.append(assistant_msg)
                        self.state.updated_at = datetime.utcnow()
                        self._store.save(self.state)
                        log.info("Message saved  id=%s turns=%d", self.state.id, len(self.state.messages))

                    yield event

            except Exception as e:
                log.error("Send failed  id=%s error=%s", self.state.id, e, exc_info=True)
                # Save partial content if any
                if assistant_content:
                    assistant_msg = Message(
                        role="assistant",
                        content=assistant_content,
                        tool_calls=assistant_tool_calls,
                        timestamp=datetime.utcnow(),
                    )
                    self.state.messages.append(assistant_msg)
                    self.state.updated_at = datetime.utcnow()
                    self._store.save(self.state)
                yield ErrorEvent(message=str(e))

        return _gen()

    def rename(self, title: str) -> None:
        self.state.title = title.strip()
        self.state.updated_at = datetime.utcnow()
        self._store.save(self.state)

    def pin(self) -> None:
        self.state.sticky = True
        self._store.save(self.state)

    def unpin(self) -> None:
        self.state.sticky = False
        self._store.save(self.state)

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def id(self) -> str:
        return self.state.id

    @property
    def messages(self) -> "list[Message]":
        return self.state.messages

    def __repr__(self) -> str:
        return f"Session(id={self.id!r}, agent={self.agent.id!r})"
