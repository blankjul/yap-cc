"""
Claude CLI subprocess provider for Yapflows v2.

Multi-turn conversation via --resume:
  First turn:  claude -p "msg" --append-system-prompt "..." --output-format stream-json ...
               -> capture session_id from system/init event
               -> yield SessionIdEvent first (caller persists it to SessionState.cli_session_id)
               -> then stream TextChunkEvents, ToolStartEvents, etc.
  Later turns: claude -p "msg" --resume <cli_session_id> --output-format stream-json ...
               -> claude-cli maintains history internally

Interaction (user questions) is handled by the shared <ask>...</ask> meta-language
in interaction_parser.py — no provider-level interception needed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import pty
import uuid
from typing import AsyncIterator

from ..core.provider import BaseProvider
from ..core.models import Message
from ..core.events import (
    Event, TextChunkEvent, ToolStartEvent, ToolDoneEvent,
    DoneEvent, ErrorEvent, SessionIdEvent,
)

log = logging.getLogger("yapflows.provider")

CLAUDE_BIN = os.getenv("CLAUDE_BIN", "claude")


class ClaudeCliProvider(BaseProvider):
    """Runs claude CLI as a subprocess and maps stream-json output to Events."""

    provider_id = "claude-cli"

    def __init__(self, model: str) -> None:
        super().__init__(model=model)

    async def run(
        self,
        system_prompt: str,
        history: list[Message],
        message: str,
        cli_session_id: str | None = None,
    ) -> AsyncIterator[Event]:
        args = [
            CLAUDE_BIN,
            "-p", message,
            "--output-format", "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--dangerously-skip-permissions",
            "--allowedTools", "all",
        ]

        if cli_session_id:
            args += ["--resume", cli_session_id]
        elif system_prompt:
            args += ["--append-system-prompt", system_prompt]

        # Prevent nested claude-code sessions from blocking
        env = {k: v for k, v in os.environ.items() if k not in ("CLAUDECODE", "CLAUDE_CODE")}

        log.info("Run started  model=%s resume=%s", self.model, bool(cli_session_id))

        # PTY for stdin so any terminal-aware tool sees an interactive terminal.
        stdin_master_fd, stdin_slave_fd = pty.openpty()

        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=stdin_slave_fd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        os.close(stdin_slave_fd)  # parent closes slave end; subprocess has its own copy

        captured_session_id: str | None = None
        session_id_emitted = False
        current_text_id: str | None = None
        # tool_use_id -> [render_id, tool_name, input_dict_or_None]
        pending_tools: dict[str, list] = {}

        async def _gen() -> AsyncIterator[Event]:
            nonlocal captured_session_id, session_id_emitted, current_text_id

            try:
                async for raw_line in proc.stdout:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue

                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        log.debug("Non-JSON line: %s", line[:120])
                        continue

                    event_type = event.get("type")

                    # -- System init: capture session_id ----------------------
                    if event_type == "system" and event.get("subtype") == "init":
                        sid = event.get("session_id")
                        if sid and not captured_session_id:
                            captured_session_id = sid
                            log.debug("Captured cli_session_id: %s", sid)
                            yield SessionIdEvent(cli_session_id=sid)
                            session_id_emitted = True

                    # -- Streaming partial events ------------------------------
                    elif event_type == "stream_event":
                        raw = event.get("event", {})
                        raw_type = raw.get("type", "")

                        if raw_type == "content_block_start":
                            block = raw.get("content_block", {})
                            block_type = block.get("type")

                            if block_type == "text":
                                current_text_id = str(uuid.uuid4())

                            elif block_type == "tool_use":
                                tool_use_id = block.get("id", "")
                                tool_name = block.get("name", "unknown")
                                render_id = str(uuid.uuid4())
                                pending_tools[tool_use_id] = [render_id, tool_name, None]
                                if current_text_id:
                                    current_text_id = None
                                yield ToolStartEvent(
                                    tool_call_id=render_id,
                                    tool=tool_name,
                                    input={},
                                )
                                log.info("Tool start  tool=%s", tool_name)

                        elif raw_type == "content_block_delta":
                            delta = raw.get("delta", {})
                            if delta.get("type") == "text_delta" and current_text_id:
                                yield TextChunkEvent(content=delta.get("text", ""))

                        elif raw_type == "message_stop":
                            current_text_id = None

                    # -- Complete assistant turn (full tool inputs) ------------
                    elif event_type == "assistant":
                        msg = event.get("message", {})
                        for block in msg.get("content", []):
                            if isinstance(block, dict) and block.get("type") == "tool_use":
                                tool_use_id = block.get("id", "")
                                tool_input = block.get("input", {})
                                if tool_use_id in pending_tools:
                                    pending_tools[tool_use_id][2] = tool_input

                    # -- Tool results ------------------------------------------
                    elif event_type == "user":
                        msg = event.get("message", {})
                        for block in msg.get("content", []):
                            if not isinstance(block, dict):
                                continue
                            if block.get("type") == "tool_result":
                                tool_use_id = block.get("tool_use_id", "")
                                is_error = block.get("is_error", False)
                                content = block.get("content", "")
                                if isinstance(content, list):
                                    result_text = "".join(
                                        c.get("text", "") for c in content if isinstance(c, dict)
                                    )
                                else:
                                    result_text = str(content)

                                entry = pending_tools.pop(tool_use_id, None)
                                if entry:
                                    render_id, tool_name, tool_input = entry
                                    log.info("Tool done  tool=%s", tool_name)
                                    yield ToolDoneEvent(
                                        tool_call_id=render_id,
                                        tool=tool_name,
                                        output=result_text,
                                        error=result_text if is_error else None,
                                    )

                    # -- Final result ------------------------------------------
                    elif event_type == "result":
                        current_text_id = None
                        sid = event.get("session_id")
                        if sid and not session_id_emitted:
                            captured_session_id = sid
                            yield SessionIdEvent(cli_session_id=sid)
                        elif sid:
                            captured_session_id = sid

                        log.info("Run done  session_id=%s", captured_session_id)
                        yield DoneEvent()

            except Exception as e:
                log.error("Provider error: %s", e, exc_info=True)
                yield ErrorEvent(message=str(e))

            finally:
                try:
                    os.close(stdin_master_fd)
                except OSError:
                    pass
                await proc.wait()
                if proc.returncode and proc.returncode != 0:
                    stderr_data = await proc.stderr.read()
                    stderr_text = stderr_data.decode("utf-8", errors="replace").strip()
                    if stderr_text:
                        log.error("claude CLI stderr: %s", stderr_text[:500])

        return _gen()
