"""
ExternalChatManager — routes inbound messages from external providers to sessions
and forwards outbound responses back to the originating chat.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import Config
    from ..core.models import SessionState
    from ..core.session import SessionStore
    from .base import MessagingProvider

log = logging.getLogger("yapflows.messaging")

_MD2_SPECIAL = re.compile(r'([_*\[\]()~`>#+\-=|{}.!\\])')


def _md2_user_blockquote(text: str) -> str:
    """Format a user message as a MarkdownV2 blockquote with a 'You:' label."""
    escaped = _MD2_SPECIAL.sub(r'\\\1', text)
    lines = escaped.splitlines() or [""]
    lines[0] = f"You: {lines[0]}"
    return "\n".join(f">{line}" for line in lines)


class ExternalChatManager:
    def __init__(self, config: "Config", store: "SessionStore") -> None:
        self._config = config
        self._store = store
        self._providers: dict[str, "MessagingProvider"] = {}

    def register(self, provider: "MessagingProvider") -> None:
        """Register a messaging provider and inject the inbound callback."""
        provider.set_on_message(self._on_inbound)
        self._providers[provider.provider_id] = provider

    async def start_all(self) -> None:
        for provider in self._providers.values():
            await provider.start()

    async def stop_all(self) -> None:
        for provider in self._providers.values():
            await provider.stop()

    async def _on_inbound(self, provider_id: str, chat_id: str, text: str) -> None:
        """Handle an inbound message from an external chat."""
        from ..core.agent import Agent
        from ..core.models import ExternalChat
        from ..core.session import Session

        # 1. Find existing session for this external chat
        session_state = None
        for s in self._store.list():
            if (
                s.external_chat is not None
                and s.external_chat.provider == provider_id
                and s.external_chat.chat_id == chat_id
                and not s.archived
            ):
                session_state = s
                break

        try:
            if session_state is not None:
                # Refresh chat_instructions from current provider (never goes stale)
                provider_obj = self._providers.get(provider_id)
                current_instructions = provider_obj.chat_instructions if provider_obj else ""
                if (session_state.external_chat and
                        session_state.external_chat.chat_instructions != current_instructions):
                    session_state.external_chat.chat_instructions = current_instructions
                    self._store.save(session_state)
                try:
                    session = Session.load(session_state.id, self._store, self._config)
                except KeyError as exc:
                    log.error("Cannot load session %s: %s", session_state.id, exc)
                    provider_obj = self._providers.get(provider_id)
                    if provider_obj:
                        await provider_obj.send(
                            chat_id,
                            f"⚠️ Configuration error: {exc}. Please check your agent settings.",
                        )
                    return
            else:
                # 2. Create new session for this external chat
                chat_name = self._get_chat_name(provider_id, chat_id)
                title = f"{chat_name} (Telegram)" if chat_name else f"Telegram {chat_id}"

                chat_cfg = self._get_chat_config(provider_id, chat_id)
                agent_id = chat_cfg.get("agent_id") or self._first_agent_id()
                if not agent_id:
                    log.error("No agents configured — cannot handle inbound Telegram message")
                    return

                environment_id = chat_cfg.get("environment_id") or None
                provider_obj = self._providers.get(provider_id)
                instructions = provider_obj.chat_instructions if provider_obj else ""

                # Resolve provider_id / model from the environment, if set
                session_provider_id = "claude-cli"
                session_model = "claude-opus-4-5"
                if environment_id:
                    try:
                        from ..core.environment import Environment
                        env = Environment.load(environment_id, self._config)
                        session_provider_id = env.config.provider_id
                        session_model = env.config.model
                    except Exception:
                        log.warning("Could not load environment %r for Telegram chat %s", environment_id, chat_id)

                try:
                    agent = Agent.load(agent_id, self._config)
                except KeyError as exc:
                    log.error("Cannot load agent %r for new session: %s", agent_id, exc)
                    provider_obj = self._providers.get(provider_id)
                    if provider_obj:
                        await provider_obj.send(
                            chat_id,
                            f"⚠️ Configuration error: {exc}. Please check your agent settings.",
                        )
                    return
                external_chat = ExternalChat(
                    provider=provider_id,
                    chat_id=chat_id,
                    name=chat_name,
                    chat_instructions=instructions,
                )
                session = Session.new(
                    agent=agent,
                    store=self._store,
                    config=self._config,
                    source="trigger",
                    provider_id=session_provider_id,
                    model=session_model,
                    environment_id=environment_id,
                    sticky=False,
                    title=title,
                    external_chat=external_chat,
                )
                log.info(
                    "Created Telegram session  chat_id=%s title=%r session=%s",
                    chat_id, title, session.id,
                )

            # 3. Push incoming message to any open web UI connections for this session
            from ..api.websocket.manager import get_connection_manager
            from ..core.events import SessionIdEvent, DividerEvent
            ws_manager = get_connection_manager()

            # Handle context reset commands (/new, /compact)
            if text.strip() in ("/new", "/compact"):
                name = text.strip().lstrip("/")
                async for event in await session.reset_context(name):
                    await ws_manager.send(session.id, event.model_dump())
                # Acknowledge back to the external chat
                provider_obj = self._providers.get(provider_id)
                if provider_obj:
                    ack = "Context reset." if name == "new" else f"Context compacted: {session.state.compact_context or ''}"
                    await provider_obj.send(chat_id, ack)
                return

            await ws_manager.send(session.id, {"type": "remote_user_message", "content": text})

            # 4. Stream agent response events to the web UI
            async for event in await session.send(text):
                if isinstance(event, SessionIdEvent):
                    continue
                await ws_manager.send(session.id, event.model_dump())

            # 5. Forward the last assistant response back to Telegram
            fresh_state = self._store.load(session.id)
            await self.forward_last_response(fresh_state)

        except Exception as e:
            log.error(
                "Inbound message handling failed  provider=%s chat_id=%s error=%s",
                provider_id, chat_id, e, exc_info=True,
            )

    async def broadcast_to_all_telegram(self, text: str) -> list[str]:
        """Send text to every configured Telegram chat. Returns reached chat_ids."""
        chats = self._config.get("integrations.telegram.chats", []) or []
        provider = self._providers.get("telegram")
        if provider is None:
            return []
        notified: list[str] = []
        for chat in chats:
            chat_id = str(chat.get("chat_id", ""))
            if not chat_id:
                continue
            try:
                await provider.send(chat_id, text)
                notified.append(chat_id)
            except Exception:
                log.warning("Failed to send heartbeat to Telegram chat %s", chat_id, exc_info=True)
        return notified

    async def forward_text(self, state: "SessionState", text: str, role: str | None = None) -> None:
        """Send arbitrary text to the external chat for this session."""
        if state.external_chat is None:
            return
        provider = self._providers.get(state.external_chat.provider)
        if provider is None:
            return
        outgoing = _md2_user_blockquote(text) if role == "user" else text
        await provider.send(state.external_chat.chat_id, outgoing)

    async def forward_last_response(self, state: "SessionState") -> None:
        """Send the last assistant message to the external chat, if any."""
        if state.external_chat is None:
            return
        provider = self._providers.get(state.external_chat.provider)
        if provider is None:
            return

        # Find last assistant message
        last_msg = None
        for msg in reversed(state.messages):
            if msg.role == "assistant":
                last_msg = msg
                break

        if last_msg is None or not last_msg.content:
            return

        await provider.send(state.external_chat.chat_id, last_msg.content)

    def _get_chat_config(self, provider_id: str, chat_id: str) -> dict:
        """Return the full config dict for a chat, or {} if not found."""
        if provider_id == "telegram":
            chats = self._config.get("integrations.telegram.chats", []) or []
            for c in chats:
                if str(c.get("chat_id", "")) == chat_id:
                    return c
        return {}

    def _get_chat_name(self, provider_id: str, chat_id: str) -> str:
        """Look up the human-readable chat name from config."""
        return self._get_chat_config(provider_id, chat_id).get("name", "")

    def _first_agent_id(self) -> str | None:
        """Return the ID of the first available agent, or None."""
        from ..core.agent import Agent
        try:
            agents = Agent.list(self._config)
            return agents[0].id if agents else None
        except Exception:
            return None


# ── Module-level singleton ─────────────────────────────────────────────────────

_manager: ExternalChatManager | None = None


def get_external_chat_manager() -> ExternalChatManager | None:
    return _manager


def set_external_chat_manager(m: ExternalChatManager) -> None:
    global _manager
    _manager = m
