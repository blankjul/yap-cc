"""Session CRUD routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class CreateSessionBody(BaseModel):
    agent_id: str
    environment_id: str


class RenameSessionBody(BaseModel):
    title: str


class SetAliasBody(BaseModel):
    alias: str | None


class AppendMessageBody(BaseModel):
    content: str


def _agent_config_for(state, config):
    from ...core.agent import Agent
    from ...core.models import AgentConfig
    try:
        return Agent.load(state.agent_id, config).config
    except KeyError:
        return AgentConfig(
            id=state.agent_id, name=state.agent_id,
            system_prompt="",
        )


def _env_config_for(state, config):
    from ...core.environment import Environment
    from ...core.models import EnvironmentConfig
    if state.environment_id:
        try:
            return Environment.load(state.environment_id, config).config
        except KeyError:
            pass
    # Backward compat: synthesize from provider_id + model stored on state
    return EnvironmentConfig(
        id=state.provider_id,
        name=state.provider_id,
        provider_id=state.provider_id,
        model=state.model,
    )


@router.get("/sessions")
async def list_sessions(request: Request):
    store = request.app.state.store
    config = request.app.state.config
    from ...core.models import SessionView

    states = store.list()
    result = []
    for state in sorted(states, key=lambda s: s.updated_at, reverse=True):
        agent_config = _agent_config_for(state, config)
        env_config = _env_config_for(state, config)
        result.append(
            SessionView.from_state(state, agent_config, env_config)
            .model_dump(mode="json")
        )
    return result


@router.get("/sessions/by-alias/{alias}/messages")
async def get_messages_by_alias(alias: str, request: Request, k: int = 10):
    store = request.app.state.store
    state = store.get_by_alias(alias)
    if state is None:
        raise HTTPException(status_code=404, detail=f"No session with alias: {alias}")
    messages = [m for m in state.messages if m.divider is None][-k:]
    return [
        {"role": m.role, "content": m.content, "timestamp": m.timestamp.isoformat()}
        for m in messages
    ]


@router.post("/sessions/by-alias/{alias}/append")
async def append_message_by_alias(alias: str, body: AppendMessageBody, request: Request):
    store = request.app.state.store
    state = store.get_by_alias(alias)
    if state is None:
        raise HTTPException(status_code=404, detail=f"No session with alias: {alias}")

    from datetime import datetime, timezone
    from ...core.models import Message

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Auto-set title from first line if session still has the default title
    if not state.messages and state.title in ("Heartbeat", "New Chat"):
        first_line = body.content.strip().split("\n")[0][:60]
        if first_line:
            state.title = first_line

    state.messages.append(Message(role="assistant", content=body.content, timestamp=now))
    state.updated_at = now

    # Mark unread if nobody is watching
    from ..websocket.manager import get_connection_manager
    ws_manager = get_connection_manager()
    if not ws_manager.has_connection(state.id):
        state.unread = True

    store.save(state)

    # Notify any connected WS clients
    await ws_manager.send(state.id, {
        "type": "session_message_appended",
        "session_id": state.id,
    })

    # Forward to Telegram: session-linked chat if external_chat is set,
    # otherwise broadcast to all configured chats (heartbeat use case).
    try:
        from ...messaging.manager import get_external_chat_manager
        messaging = get_external_chat_manager()
        if messaging:
            if state.external_chat:
                await messaging.forward_text(state, body.content)
            else:
                await messaging.broadcast_to_all_telegram(body.content)
    except Exception:
        import logging
        logging.getLogger("yapflows.server").warning(
            "Failed to forward appended message to Telegram", exc_info=True
        )

    return {"ok": True, "session_id": state.id}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    store = request.app.state.store
    config = request.app.state.config
    from ...core.models import SessionView

    try:
        state = store.load(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")

    agent_config = _agent_config_for(state, config)
    env_config = _env_config_for(state, config)
    return SessionView.from_state(state, agent_config, env_config).model_dump(mode="json")


@router.post("/sessions")
async def create_session(body: CreateSessionBody, request: Request):
    config = request.app.state.config
    store = request.app.state.store
    from ...core.agent import Agent
    from ...core.environment import Environment
    from ...core.session import Session
    from ...core.models import SessionView

    try:
        agent = Agent.load(body.agent_id, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Agent not found: {body.agent_id}")

    try:
        env = Environment.load(body.environment_id, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Environment not found: {body.environment_id}")

    session = Session.new(
        agent=agent, store=store, config=config,
        provider_id=env.config.provider_id,
        model=env.config.model,
        environment_id=env.config.id,
    )
    return SessionView.from_state(session.state, agent.config, env.config).model_dump(mode="json")


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, request: Request):
    store = request.app.state.store
    config = request.app.state.config
    try:
        store.delete(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/sessions/{session_id}/archive")
async def archive_session(session_id: str, request: Request):
    store = request.app.state.store
    try:
        store.archive(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/sessions/{session_id}/restore")
async def restore_session(session_id: str, request: Request):
    store = request.app.state.store
    try:
        store.restore(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.patch("/sessions/{session_id}")
async def rename_session(session_id: str, body: RenameSessionBody, request: Request):
    store = request.app.state.store
    config = request.app.state.config
    from ...core.session import Session
    try:
        session = Session.load(session_id, store, config)
        session.rename(body.title)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/sessions/{session_id}/pin")
async def pin_session(session_id: str, request: Request):
    store = request.app.state.store
    try:
        state = store.load(session_id)
        state.sticky = True
        store.save(state)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/sessions/{session_id}/unpin")
async def unpin_session(session_id: str, request: Request):
    store = request.app.state.store
    try:
        state = store.load(session_id)
        state.sticky = False
        store.save(state)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/sessions/{session_id}/set-alias")
async def set_session_alias(session_id: str, body: SetAliasBody, request: Request):
    store = request.app.state.store
    try:
        store.set_alias(session_id, body.alias)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/sessions/{session_id}/mark-read")
async def mark_session_read(session_id: str, request: Request):
    """Mark a session as read (clear unread flag)."""
    from ...core.session import FileSessionStore
    config = request.app.state.config
    store = FileSessionStore(chats_dir=config.chats_dir)
    try:
        state = store.load(session_id)
        if state.unread:
            state.unread = False
            store.save(state)
        return {"ok": True}
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")


@router.get("/sessions/{session_id}/system-prompt")
async def get_system_prompt(session_id: str, request: Request):
    store = request.app.state.store
    config = request.app.state.config
    from ...core.agent import Agent

    try:
        state = store.load(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        agent = Agent.load(state.agent_id, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Agent not found: {state.agent_id}")

    return {"content": agent.build_system_prompt()}
