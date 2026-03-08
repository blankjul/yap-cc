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

    @abstractmethod
    def set_alias(self, session_id: str, alias: "str | None") -> None:
        """Set alias on session_id; clears the same alias from any other session.
        Also pins the session (sticky=True) when alias is non-None."""
        ...

    def get_by_alias(self, alias: str) -> "SessionState | None":
        """Return the first non-archived session with the given alias. Aliases are always uppercase."""
        alias_upper = alias.upper()
        for state in self.list():
            if state.alias == alias_upper and not state.archived:
                return state
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

    def set_alias(self, session_id: str, alias: "str | None") -> None:
        if alias is not None:
            alias = alias.upper()
            for sid, state in self._sessions.items():
                if sid != session_id and state.alias == alias:
                    state.alias = None
                    self.save(state)
        state = self.load(session_id)
        state.alias = alias
        if alias is not None:
            state.sticky = True
        self.save(state)


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

    def set_alias(self, session_id: str, alias: "str | None") -> None:
        if alias is not None:
            alias = alias.upper()
            for state in self.list():
                if state.id != session_id and state.alias == alias:
                    state.alias = None
                    self.save(state)
        state = self.load(session_id)
        state.alias = alias
        if alias is not None:
            state.sticky = True
        self.save(state)


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
        config: "Config | None" = None,
    ) -> None:
        self.state = state
        self.agent = agent
        self.provider = provider
        self._store = store
        self._config = config

    # ── Factories ──────────────────────────────────────────────────────────────

    @classmethod
    def new(
        cls,
        agent: "Agent",
        store: SessionStore,
        config: "Config | None" = None,
        source: str = "manual",
        provider_id: str = "claude-cli",
        model: str = "claude-opus-4-5",
        environment_id: str | None = None,
        task_name: str | None = None,
        sticky: bool = False,
        title: str | None = None,
        external_chat: "ExternalChat | None" = None,
    ) -> "Session":
        """Create a new session. Provider and model taken from explicit params."""
        from .models import SessionState
        from ..providers.claude_cli import ClaudeCliProvider
        from ..providers.openrouter import OpenRouterProvider

        now = datetime.utcnow()

        state = SessionState(
            id=_new_session_id(),
            title=title or "New conversation",
            agent_id=agent.id,
            provider_id=provider_id,  # type: ignore[arg-type]
            model=model,
            environment_id=environment_id,
            source=source,  # type: ignore[arg-type]
            task_name=task_name,
            sticky=sticky,
            created_at=now,
            updated_at=now,
            external_chat=external_chat,
        )

        # Resolve provider
        if provider_id == "claude-cli":
            provider: "BaseProvider" = ClaudeCliProvider(model=model)
        elif provider_id == "openrouter":
            import os
            api_key = (config.openrouter_api_key if config else "") or os.getenv("OPENROUTER_API_KEY", "")
            provider = OpenRouterProvider(model=model, api_key=api_key)
        else:
            raise ValueError(f"Unknown provider: {provider_id}")

        store.save(state)
        log.info("Created  id=%s agent=%s provider=%s model=%s environment=%s",
                 state.id, agent.id, provider_id, model, environment_id)
        return cls(state=state, agent=agent, provider=provider, store=store, config=config)

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
            api_key = config.openrouter_api_key or os.getenv("OPENROUTER_API_KEY", "")
            provider = OpenRouterProvider(model=state.model, api_key=api_key)
        else:
            raise ValueError(f"Unknown provider: {state.provider_id}")

        return cls(state=state, agent=agent, provider=provider, store=store, config=config)

    # ── Behaviour ─────────────────────────────────────────────────────────────

    async def reset_context(self, kind: str) -> AsyncIterator["Event"]:
        """Insert a context divider. For 'compact', runs a one-shot summary first."""
        from .models import Message
        from .events import DividerEvent, TextChunkEvent, DoneEvent

        now = datetime.utcnow()

        if kind == "new":
            chat_instr = self.state.external_chat.chat_instructions if self.state.external_chat else ""
            new_system_prompt = self.agent.build_system_prompt(chat_instructions=chat_instr)

            divider_msg = Message(role="user", content="", divider="new", timestamp=now,
                                  system_prompt=new_system_prompt)
            self.state.messages.append(divider_msg)
            self.state.cli_session_id = None
            self.state.compact_context = None
            self.state.updated_at = now
            self._store.save(self.state)
            log.info("Context reset (new)  id=%s", self.state.id)

            async def _new_gen():
                yield DividerEvent(kind="new", system_prompt=new_system_prompt)

            return _new_gen()

        elif kind == "compact":
            # Build history slice (everything since the last divider, excluding dividers)
            msgs = self.state.messages
            divider_indices = [i for i, m in enumerate(msgs) if m.divider]
            start_idx = divider_indices[-1] + 1 if divider_indices else 0
            history = [m for m in msgs[start_idx:] if not m.divider]

            # One-shot summary — no cli_session_id so it starts fresh
            summary = ""
            async for event in await self.provider.run(
                system_prompt="You are a helpful assistant.",
                history=history,
                message="Summarize this conversation in 3–5 sentences for context continuity. Be concise.",
                cli_session_id=None,
            ):
                if isinstance(event, TextChunkEvent):
                    summary += event.content
                elif isinstance(event, DoneEvent):
                    break

            chat_instr = self.state.external_chat.chat_instructions if self.state.external_chat else ""
            compact_system_prompt = self.agent.build_system_prompt(chat_instructions=chat_instr)
            compact_system_prompt += f"\n\n---\nPrevious context:\n{summary}"

            divider_msg = Message(role="user", content=summary, divider="compact", timestamp=now,
                                  system_prompt=compact_system_prompt)
            self.state.messages.append(divider_msg)
            self.state.compact_context = summary
            self.state.cli_session_id = None
            self.state.updated_at = now
            self._store.save(self.state)
            log.info("Context compacted  id=%s summary_len=%d", self.state.id, len(summary))

            async def _compact_gen():
                yield DividerEvent(kind="compact", summary=summary, system_prompt=compact_system_prompt)

            return _compact_gen()

        else:
            raise ValueError(f"Unknown context reset kind: {kind!r}")

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

        # Expand skill invocations: /skill-name → inject SKILL.md content as prompt
        if message.startswith("/"):
            skill_name = message[1:].strip()
            from .skill import Skill
            try:
                if self._config is None:
                    from ..config import get_config
                    self._config = get_config()
                skill = Skill.load(skill_name, self._config)
                instructions = skill.read_instructions()
                message = f"Follow these skill instructions:\n\n{instructions}"
                log.info("Expanded skill invocation: /%s", skill_name)
            except KeyError:
                pass  # not a skill — send as-is

        # Assemble system prompt; inject compact context if present
        chat_instr = self.state.external_chat.chat_instructions if self.state.external_chat else ""
        system_prompt = self.agent.build_system_prompt(chat_instructions=chat_instr)
        if self.state.compact_context:
            system_prompt += f"\n\n---\nPrevious context:\n{self.state.compact_context}"

        # History slice: only messages after the last divider (excluding dividers themselves)
        msgs = self.state.messages[:-1]  # exclude the new user msg being sent now
        divider_indices = [i for i, m in enumerate(msgs) if m.divider]
        start_idx = divider_indices[-1] + 1 if divider_indices else 0
        history = [m for m in msgs[start_idx:] if not m.divider]

        # Build assistant message accumulator.
        # _current_segment tracks text in the current gap between tool calls.
        # When a new tool starts, the segment resets — only the final segment
        # (text after the last tool call) is persisted as the message content.
        # This prevents pre-tool narration ("Let me check…") from leaking into
        # saved messages and being forwarded to external chats (e.g. Telegram).
        _current_segment = ""
        assistant_tool_calls: list[ToolCall] = []
        in_flight_tools: dict[str, ToolCall] = {}

        async def _gen():
            nonlocal _current_segment

            try:
                async for event in await self.provider.run(
                    system_prompt=system_prompt,
                    history=history,
                    message=message,
                    cli_session_id=self.state.cli_session_id,
                ):
                    # Handle internal events
                    if isinstance(event, SessionIdEvent):
                        self.state.cli_session_id = event.cli_session_id
                        self._store.save(self.state)  # persist immediately so reload/cancel doesn't lose it
                        continue  # not forwarded to frontend

                    if isinstance(event, TextChunkEvent):
                        _current_segment += event.content

                    # Track tool calls; reset current text segment so pre-tool
                    # narration is not included in the saved message content.
                    elif isinstance(event, ToolStartEvent):
                        _current_segment = ""
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

                    elif isinstance(event, DoneEvent):
                        # Finalize assistant message
                        assistant_msg = Message(
                            role="assistant",
                            content=_current_segment,
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
                if _current_segment:
                    assistant_msg = Message(
                        role="assistant",
                        content=_current_segment,
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
