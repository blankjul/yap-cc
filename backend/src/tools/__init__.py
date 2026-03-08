"""
Strands @tool registry for the openrouter provider.

Only bash is registered as a Strands tool — it's the primitive the AI uses
to run everything else (CLI scripts, skills, etc.).
These are NOT used by claude-cli (which handles tools internally).
"""

from __future__ import annotations

from typing import Any


def get_tools() -> list[Any]:
    """Return all registered Strands tools for the openrouter provider."""
    from .bash import bash_tool
    from .chat import chat_read, chat_send
    return [bash_tool, chat_read, chat_send]
