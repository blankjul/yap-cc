"""
Shared text-stream parser for <ask>...</ask> and <ask-form>...</ask-form> blocks.

Works for both providers (claude-cli and openrouter).

Supported formats:

  Single question:
    <ask>question</ask>
    <ask type="confirmation">Proceed?</ask>
    <ask type="single_choice" options="A|B|C">Which?</ask>
    <ask type="multi_choice" options="X|Y|Z">Select all that apply</ask>

  Multi-question form (all shown at once, submitted together):
    <ask-form>
      <ask name="field1">First question</ask>
      <ask name="field2" type="single_choice" options="A|B">Second question</ask>
    </ask-form>

DoneEvent is suppressed when interactions are pending — the caller
should await queue responses and fire follow-up turns before sending done.
"""

from __future__ import annotations

import asyncio
import re
import uuid
from typing import AsyncIterator

from .events import (
    DoneEvent, Event, FormQuestion, InteractionFormEvent,
    InteractionRequestEvent, TextChunkEvent,
)

# Matches a bare <ask ...>...</ask> — NOT <ask-form.
_ASK_RE = re.compile(
    r"<ask(?!-)"                             # <ask not followed by -
    r'(?:\s+type="(?P<atype>[^"]*)")?'
    r'(?:\s+options="(?P<options>[^"]*)")?'
    r"[^>]*>"
    r"(?P<question>.*?)"
    r"</ask>",
    re.DOTALL,
)

# Matches a child <ask> inside <ask-form> — supports a name attribute.
_FORM_CHILD_RE = re.compile(
    r"<ask(?!-)"
    r'(?:\s+name="(?P<name>[^"]*)")?'
    r'(?:\s+type="(?P<atype>[^"]*)")?'
    r'(?:\s+options="(?P<options>[^"]*)")?'
    r"[^>]*>"
    r"(?P<question>.*?)"
    r"</ask>",
    re.DOTALL,
)

_VALID_TYPES = {"text", "confirmation", "single_choice", "multi_choice"}

# Tails of both tag names that could be split across chunk boundaries.
_POSSIBLE_PREFIXES = (
    "<ask-form", "<ask-for", "<ask-fo", "<ask-f", "<ask-",
    "<ask", "<as", "<a", "<",
)

# Regexes to locate the start of either tag kind.
_BARE_ASK_START = re.compile(r"<ask(?=[>\s])")   # <ask> or <ask ...
_FORM_ASK_START = re.compile(r"<ask-form(?=[>\s/])")


def _partial_ask_suffix(buf: str) -> int:
    """Return the number of trailing chars that might be the start of an ask tag."""
    for prefix in _POSSIBLE_PREFIXES:
        if buf.endswith(prefix):
            return len(prefix)
    return 0


def _options(raw: str) -> list[str]:
    return [o.strip() for o in raw.split("|") if o.strip()] if raw else []


def _try_extract_bare_ask(
    buf: str,
) -> tuple[str, InteractionRequestEvent, asyncio.Queue, str] | None:
    """Extract the first bare <ask>...</ask> from buf. Returns None if incomplete."""
    from ..tools.interaction import register_interaction

    m_start = _BARE_ASK_START.search(buf)
    if not m_start:
        return None

    pos = m_start.start()
    close_end = buf.find("</ask>", pos)
    if close_end == -1:
        return None

    full_tag = buf[pos : close_end + len("</ask>")]
    m = _ASK_RE.match(full_tag)
    if not m:
        return None

    atype = m.group("atype") or "text"
    if atype not in _VALID_TYPES:
        atype = "text"
    question = m.group("question").strip()
    opts = _options(m.group("options") or "")

    req_id = str(uuid.uuid4())
    q = register_interaction(req_id)
    event = InteractionRequestEvent(
        request_id=req_id,
        question=question,
        input_type=atype,  # type: ignore[arg-type]
        options=opts,
    )
    return buf[:pos], event, q, buf[close_end + len("</ask>") :]


def _try_extract_ask_form(
    buf: str,
) -> tuple[str, InteractionFormEvent, asyncio.Queue, str] | None:
    """Extract the first <ask-form>...</ask-form> from buf. Returns None if incomplete."""
    from ..tools.interaction import register_interaction

    m_start = _FORM_ASK_START.search(buf)
    if not m_start:
        return None

    pos = m_start.start()
    close_tag = "</ask-form>"
    close_end = buf.find(close_tag, pos)
    if close_end == -1:
        return None

    # Inner content between the opening > and </ask-form>
    open_close = buf.find(">", pos)
    if open_close == -1 or open_close >= close_end:
        return None
    inner = buf[open_close + 1 : close_end]

    questions: list[FormQuestion] = []
    for i, m in enumerate(_FORM_CHILD_RE.finditer(inner)):
        name = (m.group("name") or f"q{i + 1}").strip()
        atype = m.group("atype") or "text"
        if atype not in _VALID_TYPES:
            atype = "text"
        question = m.group("question").strip()
        opts = _options(m.group("options") or "")
        questions.append(FormQuestion(
            name=name,
            question=question,
            input_type=atype,  # type: ignore[arg-type]
            options=opts,
        ))

    if not questions:
        return None  # empty form — treat as plain text

    # Parse paginated attribute from the opening tag: <ask-form paginated="true">
    opening_tag = buf[pos : open_close + 1]
    paginated = bool(re.search(r'paginated="true"', opening_tag, re.IGNORECASE))

    req_id = str(uuid.uuid4())
    q = register_interaction(req_id)
    event = InteractionFormEvent(request_id=req_id, questions=questions, paginated=paginated)
    after = buf[close_end + len(close_tag) :]
    return buf[:pos], event, q, after


def _first_tag_pos(buf: str) -> tuple[int, str] | None:
    """Return (position, 'ask'|'form') for the earliest interaction tag in buf."""
    m_ask = _BARE_ASK_START.search(buf)
    m_form = _FORM_ASK_START.search(buf)

    if not m_ask and not m_form:
        return None
    if m_ask and (not m_form or m_ask.start() <= m_form.start()):
        return m_ask.start(), "ask"
    assert m_form
    return m_form.start(), "form"


def _process_buffer(
    buf: str,
    pending: list[tuple[str, asyncio.Queue]],
) -> tuple[list[Event], str]:
    """
    Greedily extract all complete interaction tags from buf.
    Returns (events_to_yield, remaining_buf).
    """
    events: list[Event] = []

    while True:
        tag_info = _first_tag_pos(buf)

        if tag_info is None:
            # No tags — flush all except possible partial suffix.
            keep = _partial_ask_suffix(buf)
            safe = buf[: len(buf) - keep] if keep else buf
            if safe:
                events.append(TextChunkEvent(content=safe))
            buf = buf[len(buf) - keep :] if keep else ""
            break

        first_pos, kind = tag_info
        extractor = _try_extract_ask_form if kind == "form" else _try_extract_bare_ask
        result = extractor(buf)

        if result is None:
            # Tag found but incomplete — flush text before it and wait for more.
            if first_pos > 0:
                events.append(TextChunkEvent(content=buf[:first_pos]))
            buf = buf[first_pos:]
            break

        before, ev, q, buf = result
        if before:
            events.append(TextChunkEvent(content=before))
        pending.append((ev.request_id, q))
        events.append(ev)
        # Loop to check for more tags.

    return events, buf


async def parse_interactions(
    inner: AsyncIterator[Event],
    pending: list[tuple[str, asyncio.Queue]],
) -> AsyncIterator[Event]:
    """
    Async generator wrapping `inner`. Intercepts <ask> and <ask-form> in text.

    Usage:
        pending: list[tuple[str, asyncio.Queue]] = []
        async for event in parse_interactions(await session.send(msg), pending):
            await ws.send_json(event.model_dump())
        # If pending is non-empty, DoneEvent was suppressed — caller must loop.
    """
    buf = ""

    async for event in inner:
        if isinstance(event, TextChunkEvent):
            buf += event.content
            evts, buf = _process_buffer(buf, pending)
            for e in evts:
                yield e
            continue

        # Non-text event: flush safe buffered text first.
        tag_info = _first_tag_pos(buf)
        if tag_info is None:
            keep = _partial_ask_suffix(buf)
            safe = buf[: len(buf) - keep] if keep else buf
            if safe:
                yield TextChunkEvent(content=safe)
            buf = buf[len(buf) - keep :] if keep else ""
        else:
            first_pos, _ = tag_info
            if first_pos > 0:
                yield TextChunkEvent(content=buf[:first_pos])
            buf = buf[first_pos:]

        if isinstance(event, DoneEvent):
            # Final extraction pass.
            evts, buf = _process_buffer(buf, pending)
            for e in evts:
                yield e
            if buf:
                yield TextChunkEvent(content=buf)
            if pending:
                return  # suppress DoneEvent — caller handles loop
            yield event
            return

        yield event
