"""
WebSocket connection pool for Yapflows v2.

Tracks active connections keyed by session_id.
Broadcasts events to all connections for a given session.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket

log = logging.getLogger("yapflows.server")


class ConnectionManager:
    def __init__(self) -> None:
        # session_id -> list of websocket connections
        self._connections: dict[str, list["WebSocket"]] = {}

    async def connect(self, session_id: str, ws: "WebSocket") -> None:
        await ws.accept()
        self._connections.setdefault(session_id, []).append(ws)
        log.debug("WS connected  session=%s total=%d", session_id, len(self._connections[session_id]))

    def disconnect(self, session_id: str, ws: "WebSocket") -> None:
        conns = self._connections.get(session_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self._connections.pop(session_id, None)
        log.debug("WS disconnected  session=%s", session_id)

    async def send(self, session_id: str, data: dict) -> None:
        """Send to all connections for a session."""
        for ws in list(self._connections.get(session_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(session_id, ws)

    async def broadcast(self, data: dict) -> None:
        """Send to all connected sessions."""
        for session_id in list(self._connections.keys()):
            await self.send(session_id, data)


# Module-level singleton
_manager: ConnectionManager | None = None


def get_connection_manager() -> ConnectionManager:
    global _manager
    if _manager is None:
        _manager = ConnectionManager()
    return _manager
