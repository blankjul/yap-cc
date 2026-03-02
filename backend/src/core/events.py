"""
Streaming event protocol for Yapflows v2.

The same Event types are used everywhere:
- Yielded by providers (ClaudeCliProvider, OpenRouterProvider, MockProvider)
- Streamed over WebSocket to the frontend
- Consumed in tests

SessionIdEvent is internal only — never forwarded to the frontend.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel


class TextChunkEvent(BaseModel):
    type: Literal["text_chunk"] = "text_chunk"
    content: str


class ToolStartEvent(BaseModel):
    type: Literal["tool_start"] = "tool_start"
    tool_call_id: str
    tool: str
    input: dict


class ToolDoneEvent(BaseModel):
    type: Literal["tool_done"] = "tool_done"
    tool_call_id: str
    tool: str
    output: str
    error: str | None = None
    input: dict = {}  # actual tool input, populated by CLI provider after assistant event


class DoneEvent(BaseModel):
    type: Literal["done"] = "done"


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


class SessionIdEvent(BaseModel):
    """Internal only — not forwarded to frontend.

    Carries the cli_session_id from ClaudeCliProvider so Session.send()
    can update SessionState.cli_session_id for multi-turn resumption.
    """
    type: Literal["session_id"] = "session_id"
    cli_session_id: str


class InteractionRequestEvent(BaseModel):
    """Single inline question — forwarded to frontend to show ChatAskWidget."""
    type: Literal["interaction_request"] = "interaction_request"
    request_id: str
    question: str
    input_type: Literal["text", "single_choice", "multi_choice", "confirmation"] = "text"
    options: list[str] = []


class FormQuestion(BaseModel):
    """One question inside an <ask-form> block."""
    name: str
    question: str
    input_type: Literal["text", "single_choice", "multi_choice", "confirmation"] = "text"
    options: list[str] = []


class InteractionFormEvent(BaseModel):
    """Multi-question form — forwarded to frontend to show ChatFormWidget.
    All answers are returned as a single JSON string in interaction_response.value.
    paginated=True: one question at a time, auto-advance on selection.
    paginated=False (default): all questions visible at once, explicit Submit.
    """
    type: Literal["interaction_form"] = "interaction_form"
    request_id: str
    questions: list[FormQuestion]
    paginated: bool = False


# The public event union — what providers yield and what goes over the wire.
# SessionIdEvent is handled internally by Session.send() and not forwarded.
PublicEvent = Union[
    TextChunkEvent, ToolStartEvent, ToolDoneEvent, DoneEvent, ErrorEvent,
    InteractionRequestEvent, InteractionFormEvent,
]

# Full event union including internal events — what providers actually yield.
Event = Union[
    TextChunkEvent,
    ToolStartEvent,
    ToolDoneEvent,
    DoneEvent,
    ErrorEvent,
    SessionIdEvent,
    InteractionRequestEvent,
    InteractionFormEvent,
]
