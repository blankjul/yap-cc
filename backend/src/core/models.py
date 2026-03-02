"""
Pure Pydantic data models for Yapflows v2.

No logic, no I/O. These are the serializable data layer:
- Saved to disk
- Sent over WebSocket
- Translated to views for the frontend
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, field_validator


class AgentConfig(BaseModel):
    """Agent definition loaded from a .md file with YAML front matter."""
    id: str                                          # file stem, e.g. "assistant"
    name: str                                        # display name from front matter, or id
    provider_id: Literal["claude-cli", "openrouter"]
    model: str                                       # default model (overridable at session start)
    color: str = "#6366f1"
    avatar_url: str | None = None
    system_prompt: str                               # .md body with front matter stripped
    builtin: bool = False                            # True if loaded from backend/agents/


class ToolCall(BaseModel):
    """Normalized tool call — same shape regardless of which provider produced it."""
    id: str
    tool: str
    input: dict
    output: str | None = None         # None while in-flight
    error: str | None = None
    started_at: datetime
    completed_at: datetime | None = None


class Message(BaseModel):
    """A single turn in the conversation."""
    role: Literal["user", "assistant"]
    content: str                      # full text (assembled from chunks on completion)
    tool_calls: list[ToolCall] = []   # empty for claude-cli; populated for openrouter
    timestamp: datetime


class ExternalChat(BaseModel):
    """Reference to an external messaging chat (e.g. Telegram)."""
    provider: str        # e.g. "telegram"
    chat_id: str         # always stored as string
    name: str = ""       # display name from settings (e.g. "Personal")


class SessionState(BaseModel):
    """On-disk / wire format for a conversation. Saved to ~/.yapflows/chats/{id}.json."""
    id: str
    title: str                        # auto-set from first user message (~60 chars)
    agent_id: str
    provider_id: Literal["claude-cli", "openrouter"]
    model: str
    messages: list[Message] = []
    sticky: bool = False
    archived: bool = False
    source: Literal["manual", "scheduled", "trigger"] = "manual"
    task_name: str | None = None      # set when source == "scheduled"
    created_at: datetime
    updated_at: datetime
    cli_session_id: str | None = None  # claude-cli multi-turn session ID
    external_chat: ExternalChat | None = None  # set when session was created by an external chat


# ── Rendering layer (frontend contract) ──────────────────────────────────────


class ToolCallView(BaseModel):
    """UI representation of one tool call."""
    id: str
    tool: str
    input_summary: str                # short human-readable description of input
    output_summary: str | None        # short human-readable description of output
    status: Literal["running", "done", "error"]
    duration_ms: int | None


class MessageView(BaseModel):
    """UI representation of one message — provider-independent."""
    role: Literal["user", "assistant"]
    content: str                      # markdown-ready text
    tool_calls: list[ToolCallView] = []
    timestamp: datetime


class SessionView(BaseModel):
    """Everything the frontend needs to render a conversation."""
    id: str
    title: str
    agent: AgentConfig
    model: str
    sticky: bool
    archived: bool
    is_main: bool = False
    source: Literal["manual", "scheduled", "trigger"]
    task_name: str | None
    messages: list[MessageView]
    created_at: datetime
    updated_at: datetime
    external_chat: ExternalChat | None = None

    @classmethod
    def from_state(cls, state: "SessionState", agent: AgentConfig, is_main: bool = False) -> "SessionView":
        """Convert storage format → UI format."""
        messages = []
        for msg in state.messages:
            tool_call_views = []
            for tc in msg.tool_calls:
                # Build input summary (first 100 chars of first value or key=value pairs)
                if tc.input:
                    input_parts = [f"{k}={str(v)[:50]}" for k, v in list(tc.input.items())[:3]]
                    input_summary = ", ".join(input_parts)
                else:
                    input_summary = "(no input)"

                # Build output summary
                output_summary = None
                if tc.output is not None:
                    output_summary = tc.output[:100] + "..." if len(tc.output) > 100 else tc.output
                elif tc.error is not None:
                    output_summary = f"Error: {tc.error[:100]}"

                # Determine status
                if tc.error is not None:
                    status: Literal["running", "done", "error"] = "error"
                elif tc.completed_at is not None:
                    status = "done"
                else:
                    status = "running"

                # Duration
                duration_ms = None
                if tc.started_at and tc.completed_at:
                    delta = tc.completed_at - tc.started_at
                    duration_ms = int(delta.total_seconds() * 1000)

                tool_call_views.append(ToolCallView(
                    id=tc.id,
                    tool=tc.tool,
                    input_summary=input_summary,
                    output_summary=output_summary,
                    status=status,
                    duration_ms=duration_ms,
                ))

            messages.append(MessageView(
                role=msg.role,
                content=msg.content,
                tool_calls=tool_call_views,
                timestamp=msg.timestamp,
            ))

        return cls(
            id=state.id,
            title=state.title,
            agent=agent,
            model=state.model,
            sticky=state.sticky,
            archived=state.archived,
            is_main=is_main,
            source=state.source,
            task_name=state.task_name,
            messages=messages,
            created_at=state.created_at,
            updated_at=state.updated_at,
            external_chat=state.external_chat,
        )


# ── Task models ───────────────────────────────────────────────────────────────


class TaskConfig(BaseModel):
    """A scheduled task definition. Saved to ~/.yapflows/tasks/{name}.json."""
    name: str
    cron: str
    agent_id: str
    model: str | None = None          # None → use agent's default
    prompt: str
    enabled: bool = True
    sticky_session: bool = False
    use_main_session: bool = False    # if True, post into the global main session


class TaskRun(BaseModel):
    """One execution of a TaskConfig. Saved to ~/.yapflows/runs/{id}.json."""
    id: str
    task_name: str
    status: Literal["pending", "running", "done", "failed"]
    scheduled_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    session_id: str | None = None
    error: str | None = None


# ── Trigger models ────────────────────────────────────────────────────────────


class TriggerConfig(BaseModel):
    """A webhook trigger. Saved to ~/.yapflows/triggers/{name}.json."""
    name: str
    agent_id: str
    model: str | None = None
    prompt_template: str              # {{payload}} interpolated at dispatch


# ── Skill models ──────────────────────────────────────────────────────────────


class SkillConfig(BaseModel):
    """A skill directory discovered on disk."""
    id: str                           # directory name
    description: str                  # first paragraph of skill.md
    path: Path
    builtin: bool = False             # True if from backend/skills/
    arguments: dict = {}              # parsed from front matter


# ── Setup / provider test ─────────────────────────────────────────────────────


class SetupStatus(BaseModel):
    required: bool


class ProviderTestResult(BaseModel):
    ok: bool
    error: str | None = None
