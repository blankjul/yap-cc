"""Knowledge document CRUD routes."""
from __future__ import annotations
import frontmatter
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class SaveKnowledgeBody(BaseModel):
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


@router.get("/knowledge")
async def list_knowledge(request: Request):
    config = request.app.state.config
    docs = []
    if config.knowledge_dir.exists():
        for p in sorted(config.knowledge_dir.glob("*.md")):
            stat = p.stat()
            docs.append({
                "id": p.stem,
                "name": p.stem,
                "updated_at": stat.st_mtime,
                "description": _read_description(p),
            })
    return docs


@router.get("/knowledge/{name}")
async def get_knowledge(name: str, request: Request):
    config = request.app.state.config
    path = config.knowledge_dir / f"{name}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Document not found: {name}")
    stat = path.stat()
    return {"id": name, "content": path.read_text(), "updated_at": stat.st_mtime, "file_path": str(path)}


@router.put("/knowledge/{name}")
async def save_knowledge(name: str, body: SaveKnowledgeBody, request: Request):
    config = request.app.state.config
    path = config.knowledge_dir / f"{name}.md"
    path.write_text(body.content)
    return {"ok": True, "updated_at": path.stat().st_mtime}


@router.post("/knowledge")
async def create_knowledge(body: dict, request: Request):
    config = request.app.state.config
    name = body.get("name", "").strip().replace(" ", "-").lower()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    path = config.knowledge_dir / f"{name}.md"
    if path.exists():
        raise HTTPException(status_code=409, detail=f"Document already exists: {name}")
    path.write_text(f"# {name}\n\n")
    return {"id": name}


@router.delete("/knowledge/{name}")
async def delete_knowledge(name: str, request: Request):
    config = request.app.state.config
    path = config.knowledge_dir / f"{name}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Document not found: {name}")
    path.unlink()
    return {"ok": True}
