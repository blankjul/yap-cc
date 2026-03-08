"""
Skill domain class.

Skills are reusable capabilities agents invoke via bash.
Loaded from ~/.yapflows/skills/.
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


def _load_skill_config(skill_dir: Path) -> "SkillConfig":
    from .models import SkillConfig

    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        raise FileNotFoundError(f"SKILL.md not found in {skill_dir}")

    post = frontmatter.load(str(skill_md))
    # Description: front matter field → first non-heading body line fallback
    description = (
        post.metadata.get("description")
        or next((line.lstrip("#").strip() for line in post.content.splitlines() if line.strip() and not line.startswith("#")), "")
        or "No description."
    )
    arguments = post.metadata.get("arguments") or {}

    return SkillConfig(
        id=skill_dir.name,
        description=description,
        path=skill_dir,
        arguments=arguments,
    )


class Skill:
    """Domain class wrapping SkillConfig."""

    def __init__(self, config: "SkillConfig") -> None:
        self.config = config

    @classmethod
    def load(cls, name: str, config: "Config") -> "Skill":
        """Load a skill by name. Raises KeyError if not found."""
        user_dir = config.skills_dir / name
        if user_dir.exists():
            return cls(_load_skill_config(user_dir))

        raise KeyError(f"Skill not found: {name}")

    @classmethod
    def list(cls, config: "Config") -> "list[Skill]":
        """List all skills in the user skills directory."""
        skills: list["Skill"] = []

        if config.skills_dir.exists():
            for skill_dir in sorted(config.skills_dir.iterdir()):
                if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
                    try:
                        skills.append(cls(_load_skill_config(skill_dir)))
                    except Exception as e:
                        log.warning("Failed to load skill %s: %s", skill_dir.name, e)

        return skills

    def read_instructions(self) -> str:
        """Return fully rendered SKILL.md via yapflows-local CLI (single source of truth)."""
        import subprocess
        import sys

        # Locate yapflows-local.py next to this install's tools
        tools_dir = Path(os.environ.get("USER_DIR", Path.home() / "yapflows")) / "tools"
        venv_python = Path(os.environ.get("USER_DIR", Path.home() / "yapflows")) / "venv" / "bin" / "python3"
        python = str(venv_python) if venv_python.exists() else sys.executable

        # Try user tools dir first, fall back to defaults in the source tree
        local_tool = tools_dir / "yapflows-local.py"
        if not local_tool.exists():
            # Walk up from this file to find defaults/tools/yapflows-local.py
            src = Path(__file__).parent
            for _ in range(6):
                candidate = src / "defaults" / "tools" / "yapflows-local.py"
                if candidate.exists():
                    local_tool = candidate
                    break
                src = src.parent

        if not local_tool.exists():
            log.warning("yapflows-local.py not found, falling back to raw SKILL.md")
            return (self.config.path / "SKILL.md").read_text()

        result = subprocess.run(
            [python, str(local_tool), "skills", "read", self.id],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            log.warning("yapflows-local skills read failed: %s", result.stderr.strip())
            return (self.config.path / "SKILL.md").read_text()

        return result.stdout

    @property
    def id(self) -> str:
        return self.config.id
