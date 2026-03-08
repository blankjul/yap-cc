"""
Shell environment variables exported to all subprocesses.

Single source of truth: SHELL_VARS defines every variable name + description.
- export()      → called once at server startup to set os.environ
- as_context()  → called per request to feed values into the system prompt template
- parameterize() → replaces concrete paths in strings with their $VAR equivalents
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import Config


@dataclass(frozen=True)
class ShellVar:
    name: str
    description: str


SHELL_VARS: list[ShellVar] = [
    ShellVar("USER_DIR",  "User data directory"),
    ShellVar("PYTHON",    "Path to the venv Python interpreter"),
    ShellVar("PIP",       "Path to the venv pip"),
    ShellVar("TOOLS",     "Directory containing tool scripts"),
    ShellVar("SKILLS",    "Directory containing skill scripts"),
    ShellVar("MEMORY",    "Directory for persistent memory files"),
    ShellVar("KNOWLEDGE", "Directory for knowledge/reference files"),
]


def export(config: "Config", venv_py: Path) -> None:
    """Set all shell env vars (setdefault — won't override pre-existing values)."""
    python = str(venv_py) if venv_py.exists() else "python3"
    pip = str(venv_py.parent / "pip") if venv_py.exists() else "pip3"
    values: dict[str, str] = {
        "USER_DIR":  str(config.base_dir),
        "PYTHON":    python,
        "PIP":       pip,
        "TOOLS":     str(config.tools_dir),
        "SKILLS":    str(config.skills_dir),
        "MEMORY":    str(config.memory_dir),
        "KNOWLEDGE": str(config.knowledge_dir),
    }
    for var in SHELL_VARS:
        os.environ.setdefault(var.name, values[var.name])


def as_context() -> list[dict[str, str]]:
    """Return current values + descriptions for system prompt rendering."""
    return [
        {"name": v.name, "value": os.environ.get(v.name, ""), "description": v.description}
        for v in SHELL_VARS
    ]


def parameterize(s: str) -> str:
    """Replace concrete paths in s with their $VAR equivalents.

    Sorted by value length (longest first) to avoid partial substitutions
    (e.g. $TOOLS path replaced before $USER_DIR which is a prefix of it).
    """
    replacements = sorted(
        [(os.environ.get(v.name, ""), f"${v.name}") for v in SHELL_VARS if os.environ.get(v.name)],
        key=lambda pair: len(pair[0]),
        reverse=True,
    )
    for val, var in replacements:
        s = s.replace(val, var)
    return s
