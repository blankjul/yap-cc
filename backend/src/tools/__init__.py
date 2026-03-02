"""
Strands @tool registry for the openrouter provider.

Bash and browser tools are included.
Interaction (user questions) is handled via the <ask>...</ask> meta-language
in interaction_parser.py — no Strands tool needed.
These are NOT used by claude-cli (which handles tools internally).
"""

from __future__ import annotations

from typing import Any


def get_tools() -> list[Any]:
    """Return all registered tools for the openrouter provider."""
    from .bash import bash_tool
    tools = [bash_tool]

    # Browser tool is optional (requires playwright)
    try:
        from .browser import browser_tool
        tools.append(browser_tool)
    except ImportError:
        pass

    return tools
