"""
Configuration management for Yapflows v2.

Loads settings from ~/.yapflows/settings.json and provides
typed access to all configurable values.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any


class Config:
    """Manages Yapflows configuration and directory structure."""

    def __init__(self, base_dir: Path | str | None = None) -> None:
        if base_dir is not None:
            self.base_dir = Path(base_dir).expanduser()
        else:
            env_dir = os.getenv("YAPFLOWS_DIR")
            self.base_dir = Path(env_dir).expanduser() if env_dir else Path.home() / ".yapflows"

        # Sub-directories
        self.log_dir = self.base_dir / "log"
        self.chats_dir = self.base_dir / "chats"
        self.agents_dir = self.base_dir / "agents"
        self.memory_dir = self.base_dir / "memory"
        self.knowledge_dir = self.base_dir / "knowledge"
        self.tasks_dir = self.base_dir / "tasks"
        self.runs_dir = self.base_dir / "runs"
        self.triggers_dir = self.base_dir / "triggers"
        self.skills_dir = self.base_dir / "skills"
        self.data_dir = self.base_dir / "data"

        self.settings_file = self.base_dir / "settings.json"

        self._ensure_dirs()
        self._settings: dict[str, Any] = self._load_settings()

    def _ensure_dirs(self) -> None:
        for d in [
            self.base_dir, self.log_dir, self.chats_dir, self.agents_dir,
            self.memory_dir, self.knowledge_dir, self.tasks_dir, self.runs_dir,
            self.triggers_dir, self.skills_dir, self.data_dir,
        ]:
            d.mkdir(parents=True, exist_ok=True)

    def _default_settings(self) -> dict[str, Any]:
        return {
            "version": "2.0.0",
            "created_at": datetime.now().isoformat(),
            "server": {"host": "0.0.0.0", "port": 8000},
            "providers": {
                "openrouter": {"api_key": ""}
            },
            "integrations": {
                "telegram": {"bot_token": "", "chats": []}
            },
            "ui": {"leader_key": "\\"},
            "logging": {"level": "INFO", "keep": 30},
        }

    def _load_settings(self) -> dict[str, Any]:
        if self.settings_file.exists():
            try:
                data = json.loads(self.settings_file.read_text())
                # Merge with defaults (adds any missing keys)
                defaults = self._default_settings()
                return self._deep_merge(defaults, data)
            except Exception:
                pass
        return self._default_settings()

    def _deep_merge(self, base: dict, override: dict) -> dict:
        result = base.copy()
        for k, v in override.items():
            if k in result and isinstance(result[k], dict) and isinstance(v, dict):
                result[k] = self._deep_merge(result[k], v)
            else:
                result[k] = v
        return result

    def save(self) -> None:
        self.settings_file.write_text(json.dumps(self._settings, indent=2))

    def get(self, key_path: str, default: Any = None) -> Any:
        """Dot-notation access. e.g. config.get('providers.openrouter.api_key')"""
        parts = key_path.split(".")
        val: Any = self._settings
        for part in parts:
            if not isinstance(val, dict) or part not in val:
                return default
            val = val[part]
        return val

    def set(self, key_path: str, value: Any, save: bool = True) -> None:
        parts = key_path.split(".")
        d = self._settings
        for part in parts[:-1]:
            d = d.setdefault(part, {})
        d[parts[-1]] = value
        if save:
            self.save()

    @property
    def setup_required(self) -> bool:
        """True if no settings file exists yet."""
        return not self.settings_file.exists()

    @property
    def log_level(self) -> str:
        return str(self.get("logging.level", "INFO")).upper()

    @property
    def log_keep(self) -> int:
        return int(self.get("logging.keep", 30))

    @property
    def dev_mode(self) -> bool:
        return os.getenv("DEV_MODE", "").lower() in ("1", "true", "yes")

    @property
    def openrouter_api_key(self) -> str:
        return str(self.get("providers.openrouter.api_key", ""))

    @property
    def main_agent_id(self) -> "str | None":
        val = self.get("main_agent_id")
        return str(val) if val else None

    @property
    def main_session_id(self) -> "str | None":
        val = self.get("main_session_id")
        return str(val) if val else None

    def __repr__(self) -> str:
        return f"Config(base_dir={str(self.base_dir)!r})"


# Module-level singleton
_config: Config | None = None


def get_config(base_dir: Path | str | None = None) -> Config:
    global _config
    if _config is None:
        _config = Config(base_dir)
    return _config


def reset_config() -> None:
    """Reset singleton — for testing."""
    global _config
    _config = None
