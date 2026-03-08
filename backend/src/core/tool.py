"""
Tool domain class.

Tools are single executable scripts agents can run directly via bash.
Loaded from ~/.yapflows/tools/. Files without a '# description:' comment are skipped.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import Config
    from .models import ToolConfig, ToolkitConfig

log = logging.getLogger("yapflows.tool")


def _parse_tool_file(path: Path) -> "ToolConfig | None":
    """Read leading comment lines for description and usage metadata.

    Returns None if no '# description:' line is found.
    """
    from .models import ToolConfig

    description: str | None = None
    usage: str | None = None

    try:
        lines = path.read_text(errors="replace").splitlines()
    except OSError as e:
        log.warning("Cannot read tool file %s: %s", path, e)
        return None

    for line in lines[:20]:
        stripped = line.strip()
        if stripped.startswith("# description:"):
            description = stripped[len("# description:"):].strip()
        elif stripped.startswith("# usage:"):
            usage = stripped[len("# usage:"):].strip()
        elif stripped and not stripped.startswith("#"):
            # Stop parsing once we hit real code
            break

    if not description:
        return None

    tool_id = path.stem
    return ToolConfig(
        id=tool_id,
        name=tool_id,
        description=description,
        usage=usage if usage else str(path),
        path=path,
    )


class Tool:
    """Domain class wrapping ToolConfig."""

    def __init__(self, config: "ToolConfig") -> None:
        self.config = config

    @classmethod
    def list(cls, config: "Config") -> "list[Tool]":
        """List all tools in the user tools directory."""
        results: list[Tool] = []

        if not config.tools_dir.exists():
            return results

        # Resolve {python} to the tools venv if available, else system python3
        venv_python = config.base_dir / "venv" / "bin" / "python"
        python_path = str(venv_python) if venv_python.exists() else "python3"

        for path in sorted(config.tools_dir.iterdir()):
            if not path.is_file():
                continue
            try:
                tool_config = _parse_tool_file(path)
                if tool_config is not None:
                    tool_config.usage = (
                        tool_config.usage
                        .replace("{python}", python_path)
                        .replace("{path}", str(path))
                    )
                    results.append(cls(tool_config))
            except Exception as e:
                log.warning("Failed to load tool %s: %s", path.name, e)

        return results

    @property
    def id(self) -> str:
        return self.config.id


class Toolkit:
    """Domain class wrapping a directory of related tools with a README.md overview."""

    def __init__(self, config: "ToolkitConfig") -> None:
        self.config = config

    @classmethod
    def list(cls, config: "Config") -> "list[Toolkit]":
        """List all toolkits (directories with README.md) in the user tools directory."""
        from .models import ToolkitConfig

        results: list[Toolkit] = []

        if not config.tools_dir.exists():
            return results

        venv_python = config.base_dir / "venv" / "bin" / "python"
        python_path = str(venv_python) if venv_python.exists() else "python3"

        for path in sorted(config.tools_dir.iterdir()):
            if not path.is_dir():
                continue
            readme = path / "README.md"
            if not readme.exists():
                continue
            try:
                description = readme.read_text(errors="replace").strip()
                tools = []
                for tool_path in sorted(path.iterdir()):
                    if not tool_path.is_file():
                        continue
                    tool_config = _parse_tool_file(tool_path)
                    if tool_config is not None:
                        tool_config.usage = (
                            tool_config.usage
                            .replace("{python}", python_path)
                            .replace("{path}", str(tool_path))
                        )
                        tools.append(tool_config)
                results.append(cls(ToolkitConfig(
                    id=path.name,
                    name=path.name,
                    description=description,
                    path=path,
                    tools=tools,
                )))
            except Exception as e:
                log.warning("Failed to load toolkit %s: %s", path.name, e)

        return results

    @property
    def id(self) -> str:
        return self.config.id
