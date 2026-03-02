"""Session CRUD routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class CreateSessionBody(BaseModel):
    agent_id: str
    model: str | None = None


class RenameSessionBody(BaseModel):
    title: str


def _is_main(state_id: str, config) -> bool:
    return config.main_session_id == state_id


def _agent_config_for(state, config):
    from ...core.agent import Agent
    from ...core.models import AgentConfig
    try:
        return Agent.load(state.agent_id, config).config
    except KeyError:
        return AgentConfig(
            id=state.agent_id, name=state.agent_id,
            provider_id="claude-cli", model=state.model,
            system_prompt="",
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
        result.append(
            SessionView.from_state(state, agent_config, is_main=_is_main(state.id, config))
            .model_dump(mode="json")
        )
    return result


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
    return SessionView.from_state(state, agent_config, is_main=_is_main(state.id, config)).model_dump(mode="json")


@router.post("/sessions")
async def create_session(body: CreateSessionBody, request: Request):
    config = request.app.state.config
    store = request.app.state.store
    from ...core.agent import Agent
    from ...core.session import Session
    from ...core.models import SessionView

    try:
        agent = Agent.load(body.agent_id, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Agent not found: {body.agent_id}")

    session = Session.new(agent=agent, store=store, config=config, model=body.model)
    return SessionView.from_state(session.state, agent.config, is_main=_is_main(session.id, config)).model_dump(mode="json")


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, request: Request):
    store = request.app.state.store
    config = request.app.state.config
    try:
        store.delete(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    # Clear main pointer if this was the main session
    if config.main_session_id == session_id:
        config.set("main_session_id", None)
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


@router.post("/sessions/{session_id}/set-main")
async def set_main_session(session_id: str, request: Request):
    store = request.app.state.store
    config = request.app.state.config
    try:
        store.load(session_id)  # verify exists
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    config.set("main_session_id", session_id)
    return {"ok": True}


@router.post("/sessions/{session_id}/unset-main")
async def unset_main_session(session_id: str, request: Request):
    config = request.app.state.config
    if config.main_session_id == session_id:
        config.set("main_session_id", None)
    return {"ok": True}


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
