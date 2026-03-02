"""
Skill domain class.

Skills are reusable capabilities agents invoke via bash.
Search order: ~/.yapflows/skills/{name}/ → backend/skills/{name}/
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

import frontmatter

if TYPE_CHECKING:
    from ..config import Config
    from .models import SkillConfig

log = logging.getLogger("yapflows.skill")

_BUILTIN_SKILLS_DIR = Path(__file__).parent.parent.parent / "skills"


def _load_skill_config(skill_dir: Path, builtin: bool = False) -> "SkillConfig":
    from .models import SkillConfig

    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        raise FileNotFoundError(f"SKILL.md not found in {skill_dir}")

    post = frontmatter.load(str(skill_md))
    # Description: front matter field → first body line fallback
    description = (
        post.metadata.get("description")
        or next((line.lstrip("#").strip() for line in post.content.splitlines() if line.strip()), "")
        or "No description."
    )
    arguments = post.metadata.get("arguments") or {}

    return SkillConfig(
        id=skill_dir.name,
        description=description,
        path=skill_dir,
        builtin=builtin,
        arguments=arguments,
    )


class Skill:
    """Domain class wrapping SkillConfig."""

    def __init__(self, config: "SkillConfig") -> None:
        self.config = config

    @classmethod
    def load(cls, name: str, config: "Config") -> "Skill":
        """Load a skill by name. User skills override built-ins."""
        user_dir = config.skills_dir / name
        if user_dir.exists():
            return cls(_load_skill_config(user_dir, builtin=False))

        builtin_dir = _BUILTIN_SKILLS_DIR / name
        if builtin_dir.exists():
            return cls(_load_skill_config(builtin_dir, builtin=True))

        raise KeyError(f"Skill not found: {name}")

    @classmethod
    def list(cls, config: "Config") -> "list[Skill]":
        """List all discoverable skills. User skills override built-ins."""
        seen: dict[str, "Skill"] = {}

        if _BUILTIN_SKILLS_DIR.exists():
            for skill_dir in sorted(_BUILTIN_SKILLS_DIR.iterdir()):
                if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
                    try:
                        seen[skill_dir.name] = cls(_load_skill_config(skill_dir, builtin=True))
                    except Exception as e:
                        log.warning("Failed to load builtin skill %s: %s", skill_dir.name, e)

        if config.skills_dir.exists():
            for skill_dir in sorted(config.skills_dir.iterdir()):
                if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
                    try:
                        seen[skill_dir.name] = cls(_load_skill_config(skill_dir, builtin=False))
                    except Exception as e:
                        log.warning("Failed to load user skill %s: %s", skill_dir.name, e)

        return list(seen.values())

    def read_instructions(self) -> str:
        """Return skill.md contents — injected into system prompt."""
        return (self.config.path / "SKILL.md").read_text()

    @property
    def id(self) -> str:
        return self.config.id
