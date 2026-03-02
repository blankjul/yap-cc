"""
OpenRouter provider using Strands Agents SDK for Yapflows v2.

Uses the Strands Agent with LiteLLMModel and the openrouter/ model prefix.
Passes full normalized message history on each call.
Yields TextChunkEvents for text, ToolStartEvent/ToolDoneEvent for tool calls.
"""

from __future__ import annotations

import logging
from typing import AsyncIterator

from ..core.provider import BaseProvider
from ..core.models import Message
from ..core.events import (
    Event, TextChunkEvent, ToolStartEvent, ToolDoneEvent,
    DoneEvent, ErrorEvent,
)

log = logging.getLogger("yapflows.provider")


class OpenRouterProvider(BaseProvider):
    """Strands SDK provider routed through OpenRouter."""

    provider_id = "openrouter"

    def __init__(self, model: str, api_key: str) -> None:
        super().__init__(model=model)
        self._api_key = api_key

    async def run(
        self,
        system_prompt: str,
        history: list[Message],
        message: str,
        cli_session_id: str | None = None,  # ignored
    ) -> AsyncIterator[Event]:
        import asyncio

        async def _gen() -> AsyncIterator[Event]:
            event_queue: asyncio.Queue = asyncio.Queue()
            loop = asyncio.get_event_loop()

            sentinel = object()

            def _put(ev: Event) -> None:
                asyncio.run_coroutine_threadsafe(event_queue.put(ev), loop).result()

            def _run_sync():
                try:
                    from strands import Agent
                    from strands.models.litellm import LiteLLMModel

                    if not self._api_key:
                        raise ValueError(
                            "OpenRouter API key is not configured. "
                            "Set it in Settings or via OPENROUTER_API_KEY env var."
                        )

                    import os
                    os.environ["OPENROUTER_API_KEY"] = self._api_key

                    model_id = self.model if self.model.startswith("openrouter/") else f"openrouter/{self.model}"
                    llm = LiteLLMModel(
                        client_args={"api_key": self._api_key},
                        model_id=model_id,
                    )

                    from ..tools import get_tools
                    tools = get_tools()

                    strands_messages = []
                    for msg in history:
                        content = msg.content
                        if isinstance(content, str):
                            content = [{"type": "text", "text": content}]
                        strands_messages.append({"role": msg.role, "content": content})

                    # Track in-progress tool calls: toolUseId -> {name, input}
                    pending: dict[str, dict] = {}

                    def callback_handler(**kwargs):
                        # Streaming text chunk
                        text = kwargs.get("data", "")
                        if text:
                            _put(TextChunkEvent(content=text))

                        # Tool use starting (streams partial JSON input)
                        if kwargs.get("type") == "tool_use_stream":
                            current = kwargs.get("current_tool_use") or {}
                            tid = current.get("toolUseId", "")
                            name = current.get("name", "unknown")
                            inp = current.get("input") or {}
                            if tid and tid not in pending:
                                pending[tid] = {"name": name, "input": inp}
                                _put(ToolStartEvent(
                                    tool_call_id=tid,
                                    tool=name,
                                    input=inp if isinstance(inp, dict) else {},
                                ))
                            elif tid:
                                # Update with latest partial input
                                pending[tid]["input"] = inp

                        # Tool result message — tool execution is done
                        if "message" in kwargs:
                            msg_obj = kwargs["message"]
                            if isinstance(msg_obj, dict):
                                for block in msg_obj.get("content", []):
                                    if not isinstance(block, dict):
                                        continue
                                    tr = block.get("toolResult")
                                    if not tr:
                                        continue
                                    tid = tr.get("toolUseId", "")
                                    info = pending.pop(tid, {})
                                    output_parts = []
                                    for c in tr.get("content", []):
                                        if isinstance(c, dict) and "text" in c:
                                            output_parts.append(c["text"])
                                    inp = info.get("input", {})
                                    _put(ToolDoneEvent(
                                        tool_call_id=tid,
                                        tool=info.get("name", "unknown"),
                                        output="\n".join(output_parts),
                                        input=inp if isinstance(inp, dict) else {},
                                    ))

                    agent = Agent(
                        model=llm,
                        system_prompt=system_prompt,
                        tools=tools,
                        messages=strands_messages,
                        callback_handler=callback_handler,
                    )

                    agent(message)

                except ImportError as e:
                    log.error("Strands SDK not available: %s", e)
                    _put(ErrorEvent(message=f"OpenRouter provider requires strands-agents: {e}"))
                except Exception as e:
                    log.error("OpenRouter provider error: %s", e, exc_info=True)
                    _put(ErrorEvent(message=str(e)))
                finally:
                    asyncio.run_coroutine_threadsafe(event_queue.put(sentinel), loop).result()

            executor_future = loop.run_in_executor(None, _run_sync)

            while True:
                item = await event_queue.get()
                if item is sentinel:
                    break
                yield item  # type: ignore[misc]

            await executor_future
            log.info("Run done  model=%s", self.model)
            yield DoneEvent()

        return _gen()
