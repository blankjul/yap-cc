"""
TelegramProvider — python-telegram-bot >= 21 polling integration.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Awaitable, Callable, ClassVar

from .base import MessagingProvider

if TYPE_CHECKING:
    from ..config import Config

log = logging.getLogger("yapflows.telegram")


class TelegramProvider(MessagingProvider):
    provider_id: ClassVar[str] = "telegram"

    def __init__(self, config: "Config") -> None:
        self._bot_token: str = config.get("integrations.telegram.bot_token", "") or ""
        chats_raw: list[dict] = config.get("integrations.telegram.chats", []) or []
        self._allowed_chat_ids: set[str] = {str(c["chat_id"]) for c in chats_raw}
        self._chat_names: dict[str, str] = {
            str(c["chat_id"]): c.get("name", "") for c in chats_raw
        }
        self._on_message: Callable[[str, str, str], Awaitable[None]] | None = None
        self._app = None

    @property
    def configured(self) -> bool:
        return bool(self._bot_token and self._allowed_chat_ids)

    def set_on_message(self, cb: Callable[[str, str, str], Awaitable[None]]) -> None:
        self._on_message = cb

    async def start(self) -> None:
        if not self.configured:
            log.info("Telegram not configured — skipping")
            return
        try:
            from telegram.ext import Application, MessageHandler, filters

            self._app = Application.builder().token(self._bot_token).build()
            self._app.add_handler(
                MessageHandler(filters.TEXT & ~filters.COMMAND, self._handle_update)
            )
            await self._app.initialize()
            await self._app.start()
            await self._app.updater.start_polling(drop_pending_updates=True)
            log.info("Telegram polling started  allowed_chats=%d", len(self._allowed_chat_ids))
        except Exception as e:
            log.error("Failed to start Telegram: %s", e, exc_info=True)
            self._app = None

    async def stop(self) -> None:
        if self._app is None:
            return
        try:
            await self._app.updater.stop()
            await self._app.stop()
            await self._app.shutdown()
            log.info("Telegram stopped")
        except Exception as e:
            log.warning("Error stopping Telegram: %s", e)
        finally:
            self._app = None

    async def send(self, chat_id: str, text: str) -> None:
        if self._app is None:
            log.warning("Telegram send called but provider is not started")
            return
        try:
            await self._app.bot.send_message(
                chat_id=chat_id,
                text=text,
                parse_mode="MarkdownV2",
            )
        except Exception:
            try:
                # Fallback: plain text
                await self._app.bot.send_message(chat_id=chat_id, text=text)
            except Exception as e:
                log.error("Telegram send failed  chat_id=%s error=%s", chat_id, e)

    async def _handle_update(self, update, context) -> None:
        if update.message is None:
            return
        chat_id = str(update.message.chat_id)
        text = update.message.text or ""
        if not text:
            return
        if chat_id not in self._allowed_chat_ids:
            log.warning("Telegram message from unknown chat_id=%s — dropped", chat_id)
            return
        if self._on_message:
            await self._on_message(self.provider_id, chat_id, text)
