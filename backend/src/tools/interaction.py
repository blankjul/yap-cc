"""
Interaction registry for the <ask>...</ask> meta-language.

register_interaction()  — called by interaction_parser when an <ask> tag is
                          detected; pre-registers the asyncio Queue so a response
                          that arrives before we start awaiting is not lost.

resolve_interaction()   — called by the WebSocket handler when the client sends
                          an interaction_response message.
"""

from __future__ import annotations

import asyncio

# request_id -> asyncio.Queue (maxsize=1)
_pending_async: dict[str, asyncio.Queue] = {}


def register_interaction(request_id: str) -> asyncio.Queue:
    """Pre-register a queue for request_id.  Returns the queue."""
    q: asyncio.Queue = asyncio.Queue(maxsize=1)
    _pending_async[request_id] = q
    return q


def resolve_interaction(request_id: str, value: str) -> None:
    """Called from the WebSocket handler when the user submits a response."""
    q = _pending_async.get(request_id)
    if q is not None:
        q.put_nowait(value)
