"""
BaseProvider ABC and MockProvider for testing.

Providers run one model turn and yield streaming Events.
All implementations receive the same interface:
  - system_prompt: str
  - history: list[Message]
  - message: str
  - cli_session_id: str | None  (claude-cli only; ignored by others)
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, AsyncIterator, ClassVar

if TYPE_CHECKING:
    from .models import Message
    from .events import Event


class BaseProvider(ABC):
    """Abstract base for all LLM providers."""

    provider_id: ClassVar[str]

    def __init__(self, model: str) -> None:
        self.model = model

    @abstractmethod
    async def run(
        self,
        system_prompt: str,
        history: "list[Message]",
        message: str,
        cli_session_id: str | None = None,
    ) -> "AsyncIterator[Event]": ...

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(model={self.model!r})"


class MockProvider(BaseProvider):
    """Scripted provider for tests — no I/O, no subprocess, no network."""

    provider_id = "mock"

    def __init__(self, responses: list[str], delay: float = 0.0) -> None:
        super().__init__(model="mock")
        self._responses = responses
        self._delay = delay

    async def run(
        self,
        system_prompt: str,
        history: "list[Message]",
        message: str,
        cli_session_id: str | None = None,
    ) -> "AsyncIterator[Event]":
        from .events import TextChunkEvent, DoneEvent

        async def _gen():
            for chunk in self._responses:
                if self._delay:
                    await asyncio.sleep(self._delay)
                yield TextChunkEvent(content=chunk)
            yield DoneEvent()

        return _gen()
