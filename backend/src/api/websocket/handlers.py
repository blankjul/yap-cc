"""
WebSocket endpoint and message loop for Yapflows v2.

Endpoint: WS /ws/{session_id}

Incoming message types (client -> server):
  {"type": "user_message", "content": "..."}
  {"type": "interaction_response", "value": "..."}
  {"type": "ping"}
  {"type": "stop"}

Outgoing event types (server -> client):
  {"type": "text_chunk", "content": "..."}
  {"type": "tool_start", "tool_call_id": "...", "tool": "...", "input": {...}}
  {"type": "tool_done", "tool_call_id": "...", "tool": "...", "output": "..."}
  {"type": "done"}
  {"type": "error", "message": "..."}
  {"type": "system", "text": "..."}   <- server messages (pong, etc.)
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .manager import get_connection_manager

router = APIRouter()
log = logging.getLogger("yapflows.server")


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(session_id: str, ws: WebSocket):
    manager = get_connection_manager()
    await manager.connect(session_id, ws)

    # Clear unread flag when user opens the session
    try:
        from ...config import get_config
        from ...core.session import FileSessionStore
        _config = get_config()
        _store = FileSessionStore(chats_dir=_config.chats_dir)
        _state = _store.load(session_id)
        if _state.unread:
            _state.unread = False
            _store.save(_state)
    except KeyError:
        pass  # session not found yet — non-critical

    # Store per-connection state
    stop_event = asyncio.Event()
    current_stream_task: asyncio.Task | None = None

    try:
        while True:
            try:
                msg = await asyncio.wait_for(ws.receive_json(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send keepalive
                try:
                    await ws.send_json({"type": "system", "text": "keepalive"})
                except Exception:
                    break
                continue

            msg_type = msg.get("type")

            if msg_type == "ping":
                await ws.send_json({"type": "system", "text": "pong"})

            elif msg_type == "stop":
                if current_stream_task and not current_stream_task.done():
                    current_stream_task.cancel()
                    stop_event.set()

            elif msg_type == "user_message":
                content = msg.get("content", "").strip()
                if not content:
                    continue

                # Cancel any in-flight stream
                if current_stream_task and not current_stream_task.done():
                    current_stream_task.cancel()

                stop_event.clear()
                current_stream_task = asyncio.create_task(
                    _stream_message(
                        session_id=session_id,
                        content=content,
                        ws=ws,
                        manager=manager,
                        stop_event=stop_event,
                    )
                )

            elif msg_type == "interaction_response":
                request_id = msg.get("request_id", "")
                value = msg.get("value", "")
                from ...tools.interaction import resolve_interaction
                resolve_interaction(request_id, value)

            elif msg_type == "command":
                name = msg.get("name", "")
                if name in ("new", "compact"):
                    if current_stream_task and not current_stream_task.done():
                        current_stream_task.cancel()
                    stop_event.clear()
                    current_stream_task = asyncio.create_task(
                        _stream_command(
                            session_id=session_id,
                            name=name,
                            ws=ws,
                            manager=manager,
                            stop_event=stop_event,
                        )
                    )

            else:
                log.debug("Unknown WS message type: %s", msg_type)

    except WebSocketDisconnect:
        log.debug("WS client disconnected  session=%s", session_id)
    except Exception as e:
        log.error("WS error  session=%s error=%s", session_id, e, exc_info=True)
    finally:
        if current_stream_task and not current_stream_task.done():
            if stop_event.is_set():
                # User explicitly clicked Stop — cancel immediately
                current_stream_task.cancel()
            # else: WS disconnected naturally (page reload etc.) — let the stream drain in
            # the background so the assistant message still gets saved to disk.
            # ws.send_json() calls inside the task will fail silently.
        manager.disconnect(session_id, ws)


async def _expand_skill(content: str, config) -> str:
    """If content is '/skill-name', return the skill's instructions. Otherwise return as-is.

    The claude CLI interprets messages starting with '/' as slash commands, so skill
    invocations must be expanded to their actual instructions before reaching the provider.
    """
    if not content.startswith("/"):
        return content
    skill_name = content[1:].split()[0]  # first word after /
    try:
        from ...core.skill import Skill
        skill = Skill.load(skill_name, config)
        instructions = skill.read_instructions()
        log.info("Expanded skill invocation  skill=%s", skill_name)
        return instructions
    except (KeyError, Exception):
        return content  # not a skill — send as-is


async def _stream_message(
    session_id: str,
    content: str,
    ws: WebSocket,
    manager: "ConnectionManager",
    stop_event: asyncio.Event,
) -> None:
    """Load session, call send(), stream events back over WebSocket.

    Handles <ask>...</ask> interactions inline:
      1. parse_interactions() wraps the event stream and yields InteractionRequestEvent
         when an <ask> tag is detected, suppressing DoneEvent if interactions are pending.
      2. After the generator exhausts (interaction pending), we await the user's response
         (resolved via resolve_interaction() from the WS message loop).
      3. We fire a follow-up session.send() with the response and repeat until done.
    """
    from ...config import get_config
    from ...core.session import FileSessionStore, Session
    from ...core.events import SessionIdEvent, DoneEvent
    from ...core.interaction_parser import parse_interactions

    config = get_config()
    store = FileSessionStore(chats_dir=config.chats_dir)

    # Expand skill invocations (/skill-name → SKILL.md instructions) before
    # passing to the provider. The claude CLI treats leading '/' as a command.
    content = await _expand_skill(content, config)

    try:
        session = Session.load(session_id, store, config)
    except KeyError:
        await ws.send_json({"type": "error", "message": f"Session not found: {session_id}"})
        return

    log.info("WS stream start  session=%s", session_id)

    message = content

    # Mirror user message to external chat (e.g. Telegram) if session has one
    try:
        from ...messaging.manager import get_external_chat_manager
        _messaging = get_external_chat_manager()
        if _messaging:
            await _messaging.forward_text(store.load(session_id), content, role="user")
    except Exception:
        log.warning("Failed to mirror user message to external chat", exc_info=True)

    completed_normally = False
    try:
        while True:
            pending: list[tuple[str, asyncio.Queue]] = []

            async for event in parse_interactions(await session.send(message), pending):
                if stop_event.is_set():
                    break
                # SessionIdEvent and DoneEvent are internal — never forwarded here.
                # DoneEvent is sent once after the interaction loop completes.
                if isinstance(event, (SessionIdEvent, DoneEvent)):
                    continue
                try:
                    await ws.send_json(event.model_dump())
                except Exception:
                    pass  # WS closed (page reload) — keep draining so session gets saved

            if stop_event.is_set() or not pending:
                break

            # An <ask> interaction is pending: wait for the user's response.
            req_id, q = pending[0]
            log.info("Awaiting interaction response  request_id=%s", req_id)
            try:
                message = await asyncio.wait_for(q.get(), timeout=300)
            except asyncio.TimeoutError:
                message = "(no response)"
            finally:
                from ...tools.interaction import _pending_async
                _pending_async.pop(req_id, None)

            log.info("Interaction response received  len=%d", len(message))
            # Loop: send the user's response as the next turn.

        completed_normally = not stop_event.is_set()
        try:
            await ws.send_json({"type": "done"})
        except Exception:
            pass  # WS may already be closed

        if completed_normally:
            from ...messaging.manager import get_external_chat_manager
            messaging = get_external_chat_manager()
            if messaging:
                try:
                    fresh_state = store.load(session_id)
                    await messaging.forward_last_response(fresh_state)
                except Exception:
                    log.warning("Failed to forward response to external chat", exc_info=True)

    except asyncio.CancelledError:
        log.info("WS stream cancelled  session=%s", session_id)
        try:
            await ws.send_json({"type": "done"})
        except Exception:
            pass
        raise
    except Exception as e:
        log.error("WS stream error  session=%s error=%s", session_id, e, exc_info=True)
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass

    log.info("WS stream done  session=%s", session_id)


async def _stream_command(
    session_id: str,
    name: str,
    ws: WebSocket,
    manager: "ConnectionManager",
    stop_event: asyncio.Event,
) -> None:
    """Execute a context-reset command (/new or /compact) and send DividerEvent back."""
    from ...config import get_config
    from ...core.session import FileSessionStore, Session

    config = get_config()
    store = FileSessionStore(chats_dir=config.chats_dir)

    try:
        session = Session.load(session_id, store, config)
    except KeyError:
        await ws.send_json({"type": "error", "message": f"Session not found: {session_id}"})
        return

    log.info("WS command start  session=%s command=%s", session_id, name)

    try:
        async for event in await session.reset_context(name):
            if stop_event.is_set():
                break
            await ws.send_json(event.model_dump())
        await ws.send_json({"type": "done"})
    except asyncio.CancelledError:
        await ws.send_json({"type": "done"})
        raise
    except Exception as e:
        log.error("WS command error  session=%s command=%s error=%s", session_id, name, e, exc_info=True)
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass

    log.info("WS command done  session=%s command=%s", session_id, name)
