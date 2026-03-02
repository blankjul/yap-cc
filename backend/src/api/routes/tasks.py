"""Task CRUD + run routes."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class CreateTaskBody(BaseModel):
    name: str
    cron: str
    agent_id: str
    model: str | None = None
    prompt: str
    enabled: bool = True
    sticky_session: bool = False


class UpdateTaskBody(BaseModel):
    cron: str | None = None
    agent_id: str | None = None
    model: str | None = None
    prompt: str | None = None
    enabled: bool | None = None
    sticky_session: bool | None = None


@router.get("/tasks")
async def list_tasks(request: Request):
    from ...core.task import Task
    config = request.app.state.config
    tasks = Task.list(config)
    result = []
    for t in tasks:
        d = t.config.model_dump()
        p = config.tasks_dir / f"{t.config.name}.json"
        d["file_path"] = str(p)
        d["updated_at"] = p.stat().st_mtime if p.exists() else None
        result.append(d)
    return result


@router.get("/tasks/{name}")
async def get_task(name: str, request: Request):
    from ...core.task import Task
    config = request.app.state.config
    try:
        task = Task.load(name, config)
        d = task.config.model_dump()
        p = config.tasks_dir / f"{name}.json"
        d["file_path"] = str(p)
        d["updated_at"] = p.stat().st_mtime if p.exists() else None
        return d
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Task not found: {name}")


@router.post("/tasks")
async def create_task(body: CreateTaskBody, request: Request):
    from ...core.task import Task
    from ...core.models import TaskConfig
    config = request.app.state.config
    path = config.tasks_dir / f"{body.name}.json"
    if path.exists():
        raise HTTPException(status_code=409, detail=f"Task already exists: {body.name}")
    task_config = TaskConfig(**body.model_dump())
    task = Task(config=task_config, runs_dir=config.runs_dir)
    task.save(config.tasks_dir)
    # Reload scheduler
    from ...service.scheduler import reload_jobs
    reload_jobs(request.app.state.scheduler, config, request.app.state.queue)
    return task_config.model_dump()


@router.put("/tasks/{name}")
async def update_task(name: str, body: UpdateTaskBody, request: Request):
    from ...core.task import Task
    config = request.app.state.config
    try:
        task = Task.load(name, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Task not found: {name}")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for k, v in updates.items():
        setattr(task.config, k, v)
    task.save(config.tasks_dir)
    from ...service.scheduler import reload_jobs
    reload_jobs(request.app.state.scheduler, config, request.app.state.queue)
    d = task.config.model_dump()
    p = config.tasks_dir / f"{name}.json"
    d["file_path"] = str(p)
    d["updated_at"] = p.stat().st_mtime if p.exists() else None
    return d


@router.delete("/tasks/{name}")
async def delete_task(name: str, request: Request):
    config = request.app.state.config
    path = config.tasks_dir / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Task not found: {name}")
    path.unlink()
    from ...service.scheduler import reload_jobs
    reload_jobs(request.app.state.scheduler, config, request.app.state.queue)
    return {"ok": True}


@router.post("/tasks/{name}/run")
async def run_task_now(name: str, request: Request):
    from ...core.task import Task
    config = request.app.state.config
    queue = request.app.state.queue
    try:
        task = Task.load(name, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Task not found: {name}")
    run = task.enqueue(queue._queue)
    return {"run_id": run.id}


@router.get("/tasks/{name}/runs")
async def list_task_runs(name: str, request: Request):
    from ...core.task import Task
    config = request.app.state.config
    try:
        task = Task.load(name, config)
        return [r.model_dump(mode="json") for r in task.list_runs()]
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Task not found: {name}")
