"""Skill routes."""
from __future__ import annotations
import shutil
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("/skills")
async def list_skills(request: Request):
    from ...core.skill import Skill
    config = request.app.state.config
    skills = Skill.list(config)
    result = []
    for s in skills:
        # List files in skill directory
        files = [f.name for f in s.config.path.rglob("*") if f.is_file()]
        result.append({
            **s.config.model_dump(mode="json"),
            "files": files,
        })
    return result


@router.get("/skills/{skill_id}")
async def get_skill(skill_id: str, request: Request):
    from ...core.skill import Skill
    config = request.app.state.config
    try:
        skill = Skill.load(skill_id, config)
        files = [f.name for f in skill.config.path.rglob("*") if f.is_file()]
        instructions = ""
        try:
            instructions = skill.read_instructions()
        except Exception:
            pass
        return {
            **skill.config.model_dump(mode="json"),
            "instructions": instructions,
            "files": files,
        }
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")


@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str, request: Request):
    from ...core.skill import Skill
    config = request.app.state.config
    try:
        skill = Skill.load(skill_id, config)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")
    if skill.config.builtin:
        raise HTTPException(status_code=403, detail="Cannot delete built-in skills")
    shutil.rmtree(skill.config.path)
    return {"ok": True}
