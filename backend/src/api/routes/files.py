"""File utility routes: mtime checking and opening in default editor."""
from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


@router.get("/files/mtime")
async def get_mtime(path: str):
    """Return the mtime of a file (for change detection polling)."""
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    return {"mtime": p.stat().st_mtime}


class OpenFileBody(BaseModel):
    path: str


@router.post("/files/open")
async def open_file(body: OpenFileBody):
    """Open a file in the system default application."""
    p = Path(body.path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {body.path}")
    subprocess.Popen(["open", str(p)])
    return {"ok": True}
