"""Memory file CRUD routes."""
from __future__ import annotations
import frontmatter
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class SaveMemoryBody(BaseModel):
    content: str


def _read_description(path) -> str | None:
    try:
        post = frontmatter.load(str(path))
        if post.metadata.get("description"):
            return post.metadata["description"]
        for line in post.content.splitlines():
            line = line.lstrip("#").strip()
            if line:
                return line[:80]
        return None
    except Exception:
        return None


@router.get("/memory")
async def list_memory(request: Request):
    config = request.app.state.config
    topics = []
    if config.memory_dir.exists():
        for p in sorted(config.memory_dir.glob("*.md")):
            topics.append({"id": p.stem, "name": p.stem, "description": _read_description(p)})
    # Ensure default is first
    topics.sort(key=lambda t: (0 if t["id"] == "default" else 1, t["id"]))
    return topics


@router.get("/memory/{topic}")
async def get_memory(topic: str, request: Request):
    config = request.app.state.config
    path = config.memory_dir / f"{topic}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Topic not found: {topic}")
    stat = path.stat()
    return {"id": topic, "content": path.read_text(), "file_path": str(path), "updated_at": stat.st_mtime}


@router.put("/memory/{topic}")
async def save_memory(topic: str, body: SaveMemoryBody, request: Request):
    config = request.app.state.config
    path = config.memory_dir / f"{topic}.md"
    path.write_text(body.content)
    return {"ok": True, "updated_at": path.stat().st_mtime}


@router.post("/memory")
async def create_memory(body: dict, request: Request):
    config = request.app.state.config
    topic = body.get("name", "").strip().replace(" ", "-").lower()
    if not topic:
        raise HTTPException(status_code=400, detail="name required")
    path = config.memory_dir / f"{topic}.md"
    if path.exists():
        raise HTTPException(status_code=409, detail=f"Topic already exists: {topic}")
    path.write_text(f"# {topic}\n\n")
    return {"id": topic}


@router.delete("/memory/{topic}")
async def delete_memory(topic: str, request: Request):
    if topic == "default":
        raise HTTPException(status_code=400, detail="Cannot delete default memory")
    config = request.app.state.config
    path = config.memory_dir / f"{topic}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Topic not found: {topic}")
    path.unlink()
    return {"ok": True}
