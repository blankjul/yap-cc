"""Environments CRUD routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class CreateEnvironmentBody(BaseModel):
    id: str
    name: str
    provider_id: str
    model: str


class UpdateEnvironmentBody(BaseModel):
    name: str | None = None
    provider_id: str | None = None
    model: str | None = None


@router.get("/environments")
async def list_environments(request: Request):
    config = request.app.state.config
    from ...core.environment import Environment
    return [e.config.model_dump() for e in Environment.list(config)]


@router.get("/environments/{env_id}")
async def get_environment(env_id: str, request: Request):
    config = request.app.state.config
    from ...core.environment import Environment
    try:
        env = Environment.load(env_id, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Environment not found: {env_id}")
    return env.config.model_dump()


@router.post("/environments")
async def create_environment(body: CreateEnvironmentBody, request: Request):
    config = request.app.state.config
    from ...core.environment import Environment
    from ...core.models import EnvironmentConfig
    env_config = EnvironmentConfig(
        id=body.id,
        name=body.name,
        provider_id=body.provider_id,  # type: ignore[arg-type]
        model=body.model,
    )
    Environment.save(env_config, config)
    return env_config.model_dump()


@router.put("/environments/{env_id}")
async def update_environment(env_id: str, body: UpdateEnvironmentBody, request: Request):
    config = request.app.state.config
    from ...core.environment import Environment
    try:
        env = Environment.load(env_id, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Environment not found: {env_id}")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = env.config.model_copy(update=updates)
    Environment.save(updated, config)
    return updated.model_dump()


@router.delete("/environments/{env_id}")
async def delete_environment(env_id: str, request: Request):
    config = request.app.state.config
    from ...core.environment import Environment
    try:
        Environment.delete(env_id, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Environment not found: {env_id}")
    return {"ok": True}
