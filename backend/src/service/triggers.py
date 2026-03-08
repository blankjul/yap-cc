"""
Trigger registry and dispatch for Yapflows v2.

Triggers react to external events (webhooks, Telegram).
Each trigger maps an external signal to an agent session.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import Config
    from ..core.session import SessionStore

log = logging.getLogger("yapflows.trigger")


class TriggerRegistry:
    """Holds all loaded triggers and dispatches incoming payloads."""

    def __init__(self, config: "Config", store: "SessionStore") -> None:
        self._config = config
        self._store = store

    async def dispatch(self, trigger_name: str, payload: str) -> None:
        """
        Dispatch an incoming payload to the named trigger.
        Creates/resumes the trigger's sticky session asynchronously.
        Exceptions in the background task are logged via done_callback.
        """
        import asyncio
        from ..core.trigger import Trigger

        try:
            trigger = Trigger.load(trigger_name, self._config)
        except KeyError:
            raise KeyError(f"Trigger not found: {trigger_name}")

        task = asyncio.create_task(
            trigger.dispatch(payload, self._store, self._config)
        )

        def _log_error(t: asyncio.Task) -> None:
            if not t.cancelled() and t.exception() is not None:
                log.error(
                    "Trigger dispatch failed  name=%s error=%s",
                    trigger_name, t.exception(), exc_info=t.exception(),
                )

        task.add_done_callback(_log_error)
        log.info("Trigger dispatched  name=%s", trigger_name)


