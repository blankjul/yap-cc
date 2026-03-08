"""Agent CRUD routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class CreateAgentBody(BaseModel):
    name: str
    color: str = "#6366f1"
    system_prompt: str = "You are a helpful assistant."


class UpdateAgentBody(BaseModel):
    name: str | None = None
    color: str | None = None
    system_prompt: str | None = None


def _agent_file_path(agent_id: str, config) -> "Path":
    return config.agents_dir / f"{agent_id}.md"


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
    from ...core.agent import Agent
    import frontmatter as fm

    config = request.app.state.config
    path = config.agents_dir / f"{agent_id}.md"

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    post = fm.load(str(path))

    if body.name is not None:
        post.metadata["name"] = body.name
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
