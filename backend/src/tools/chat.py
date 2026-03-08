"""
chat_read / chat_send Strands tools for Yapflows v2.

Both tools call the local HTTP API so that both the openrouter provider
(via Strands @tool) and the claude-cli provider (via bash curl) hit the
same code path.

`set_chat_base_url` is called once on server startup so the module-level
base URL reflects the configured port.
"""

from __future__ import annotations

import logging

log = logging.getLogger("yapflows.tool")

_base_url: str = "http://localhost:8000"


def set_chat_base_url(url: str) -> None:
    global _base_url
    _base_url = url


try:
    from strands import tool  # type: ignore[import-untyped]

    @tool
    def chat_read(alias: str, k: int = 10) -> str:
        """
        Read the last k messages from a session identified by its alias.

        Args:
            alias: The session alias (e.g. "heartbeat")
            k: Number of recent messages to return (default 10)

        Returns:
            JSON array of {role, content, timestamp} objects, or an error string
        """
        import httpx
        log.info("Tool called  tool=chat_read alias=%s k=%d", alias, k)
        try:
            resp = httpx.get(
                f"{_base_url}/api/sessions/by-alias/{alias}/messages",
                params={"k": k},
                timeout=10,
            )
            return resp.text if resp.is_success else f"Error {resp.status_code}: {resp.text}"
        except Exception as e:
            log.error("Tool error  tool=chat_read error=%s", e)
            return f"Error: {e}"

    @tool
    def chat_send(alias: str, content: str) -> str:
        """
        Append a message to a session identified by its alias.

        Use this to post the final summary or update to the user-facing session.
        If you decide nothing is worth reporting, do not call this tool.

        Args:
            alias: The session alias (e.g. "heartbeat")
            content: The message content to append (markdown supported)

        Returns:
            "ok" on success, or an error string
        """
        import httpx
        log.info("Tool called  tool=chat_send alias=%s content_len=%d", alias, len(content))
        try:
            resp = httpx.post(
                f"{_base_url}/api/sessions/by-alias/{alias}/append",
                json={"content": content},
                timeout=10,
            )
            return "ok" if resp.is_success else f"Error {resp.status_code}: {resp.text}"
        except Exception as e:
            log.error("Tool error  tool=chat_send error=%s", e)
            return f"Error: {e}"

except ImportError:
    # strands not installed — create dummies for import purposes
    def chat_read(alias: str, k: int = 10) -> str:  # type: ignore[misc]
        """chat_read (strands not available)."""
        return "Error: strands-agents not installed"

    def chat_send(alias: str, content: str) -> str:  # type: ignore[misc]
        """chat_send (strands not available)."""
        return "Error: strands-agents not installed"
