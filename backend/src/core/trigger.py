"""
Trigger domain class.

Triggers react to external events (webhooks, Telegram) and dispatch
a prompt to a session.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import Config
    from .models import TriggerConfig
    from .session import Session, SessionStore

log = logging.getLogger("yapflows.trigger")


class Trigger:
    """Domain class for a webhook/Telegram trigger."""

    def __init__(
        self,
        config: "TriggerConfig",
    ) -> None:
        self.config = config

    @classmethod
    def load(cls, name: str, config: "Config") -> "Trigger":
        import json
        from .models import TriggerConfig

        path = config.triggers_dir / f"{name}.json"
        if not path.exists():
            raise KeyError(f"Trigger not found: {name}")
        trigger_config = TriggerConfig.model_validate(json.loads(path.read_text()))
        return cls(config=trigger_config)

    @classmethod
    def list(cls, config: "Config") -> "list[Trigger]":
        import json
        from .models import TriggerConfig

        triggers = []
        if config.triggers_dir.exists():
            for path in sorted(config.triggers_dir.glob("*.json")):
                try:
                    trigger_config = TriggerConfig.model_validate(json.loads(path.read_text()))
                    triggers.append(cls(config=trigger_config))
                except Exception as e:
                    log.warning("Failed to load trigger %s: %s", path.name, e)
        return triggers

    async def dispatch(self, payload: str, store: "SessionStore", config: "Config") -> "Session":
        """Interpolate prompt and send to sticky session."""
        from .agent import Agent
        from .session import Session

        agent = Agent.load(self.config.agent_id, config)

        # Find or create sticky session for this trigger
        trigger_key = f"trigger:{self.config.name}"
        existing = [
            s for s in store.list()
            if s.task_name == trigger_key and s.sticky and not s.archived
        ]

        if existing:
            session = Session.load(existing[0].id, store, config)
        else:
            session = Session.new(
                agent=agent, store=store, config=config, source="trigger",
                model=self.config.model, task_name=trigger_key, sticky=True,
            )

        prompt = self.config.prompt_template.replace("{{payload}}", payload)
        async for _ in await session.send(prompt):
            pass

        # Forward response to external chat if applicable
        try:
            from ..messaging.manager import get_external_chat_manager
            messaging = get_external_chat_manager()
            if messaging:
                fresh_state = store.load(session.id)
                await messaging.forward_last_response(fresh_state)
        except Exception:
            log.warning("Failed to forward trigger response to external chat", exc_info=True)

        log.info("Trigger dispatched  name=%s session=%s", self.config.name, session.id)
        return session

    @property
    def name(self) -> str:
        return self.config.name
