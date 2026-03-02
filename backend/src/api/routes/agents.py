"""Agent CRUD routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class CreateAgentBody(BaseModel):
    name: str
    provider_id: str = "claude-cli"
    model: str = "claude-haiku-4-5-20251001"
    color: str = "#6366f1"
    system_prompt: str = "You are a helpful assistant."


class UpdateAgentBody(BaseModel):
    name: str | None = None
    provider_id: str | None = None
    model: str | None = None
    color: str | None = None
    system_prompt: str | None = None


def _agent_file_path(agent_id: str, config) -> "Path":
    from ...core.agent import _BUILTIN_AGENTS_DIR
    user_path = config.agents_dir / f"{agent_id}.md"
    return user_path if user_path.exists() else _BUILTIN_AGENTS_DIR / f"{agent_id}.md"


@router.get("/agents")
async def list_agents(request: Request):
    from ...core.agent import Agent
    config = request.app.state.config
    agents = Agent.list(config)
    result = []
    for a in agents:
        d = a.config.model_dump()
        p = _agent_file_path(a.id, config)
        d["file_path"] = str(p)
        d["updated_at"] = p.stat().st_mtime if p.exists() else None
        result.append(d)
    return result


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, request: Request):
    from ...core.agent import Agent
    config = request.app.state.config
    try:
        agent = Agent.load(agent_id, config)
        d = agent.config.model_dump()
        p = _agent_file_path(agent_id, config)
        d["file_path"] = str(p)
        d["updated_at"] = p.stat().st_mtime if p.exists() else None
        return d
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")


@router.post("/agents")
async def create_agent(body: CreateAgentBody, request: Request):
    config = request.app.state.config
    import re
    agent_id = re.sub(r"[^a-z0-9-]", "-", body.name.lower()).strip("-")
    path = config.agents_dir / f"{agent_id}.md"
    if path.exists():
        raise HTTPException(status_code=409, detail=f"Agent already exists: {agent_id}")
    
    content = f"""---
name: {body.name}
provider: {body.provider_id}
model: {body.model}
color: "{body.color}"
---

{body.system_prompt}
"""
    path.write_text(content)
    from ...core.agent import Agent
    agent = Agent.load(agent_id, config)
    return agent.config.model_dump()


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: str, body: UpdateAgentBody, request: Request):
    from ...core.agent import Agent, _BUILTIN_AGENTS_DIR
    import frontmatter as fm

    config = request.app.state.config
    path = config.agents_dir / f"{agent_id}.md"

    if not path.exists():
        # If a builtin exists, create a user override that inherits its content
        builtin_path = _BUILTIN_AGENTS_DIR / f"{agent_id}.md"
        if not builtin_path.exists():
            raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")
        builtin_post = fm.load(str(builtin_path))
        post = fm.Post(
            content=builtin_post.content,
            **{
                "name": builtin_post.metadata.get("name", agent_id),
                "provider": builtin_post.metadata.get("provider", "claude-cli"),
                "model": builtin_post.metadata.get("model", "claude-haiku-4-5-20251001"),
                "color": builtin_post.metadata.get("color", "#6366f1"),
            },
        )
        config.agents_dir.mkdir(parents=True, exist_ok=True)
    else:
        post = fm.load(str(path))

    if body.name is not None:
        post.metadata["name"] = body.name
    if body.provider_id is not None:
        post.metadata["provider"] = body.provider_id
    if body.model is not None:
        post.metadata["model"] = body.model
    if body.color is not None:
        post.metadata["color"] = body.color
    if body.system_prompt is not None:
        post.content = body.system_prompt

    path.write_text(fm.dumps(post))

    agent = Agent.load(agent_id, config)
    d = agent.config.model_dump()
    d["file_path"] = str(path)
    d["updated_at"] = path.stat().st_mtime
    return d


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, request: Request):
    config = request.app.state.config
    path = config.agents_dir / f"{agent_id}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"User agent not found: {agent_id}")
    path.unlink()
    return {"ok": True}
