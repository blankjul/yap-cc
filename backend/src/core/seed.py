"""Seed default files into the user data directory."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import Config

_SUBDIRS = {
    "agents": "agents_dir",
    "environments": "environments_dir",
    "skills": "skills_dir",
    "tools": "tools_dir",
}


def seed_defaults(defaults_dir: Path, config: "Config", skip_existing: bool = True) -> int:
    """Copy defaults/ → ~/.yapflows/. Returns count of files written."""
    copied = 0
    for subdir, attr in _SUBDIRS.items():
        src = defaults_dir / subdir
        if not src.exists():
            continue
        dst: Path = getattr(config, attr)
        for src_file in sorted(src.rglob("*")):
            if not src_file.is_file():
                continue
            rel = src_file.relative_to(src)
            dst_file = dst / rel
            dst_file.parent.mkdir(parents=True, exist_ok=True)
            if skip_existing and dst_file.exists():
                continue
            shutil.copy2(src_file, dst_file)
            copied += 1
    return copied
