"""
MessagingProvider ABC for Yapflows v2.

Any external chat integration (Telegram, etc.) implements this interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Awaitable, Callable, ClassVar


class MessagingProvider(ABC):
    provider_id: ClassVar[str]

    @abstractmethod
    async def start(self) -> None:
        """Start the provider (polling, webhook, etc.)."""
        ...

    @abstractmethod
    async def stop(self) -> None:
        """Stop the provider gracefully."""
        ...

    @abstractmethod
    async def send(self, chat_id: str, text: str) -> None:
        """Send a message to the given chat."""
        ...

    def set_on_message(self, cb: Callable[[str, str, str], Awaitable[None]]) -> None:
        """Register the inbound message callback.

        Signature: cb(provider_id, chat_id, text)
        """
        self._on_message = cb
