"""
Environment domain class.

Environments are named provider+model presets stored in ~/.yapflows/environments/.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import Config
    from .models import EnvironmentConfig

log = logging.getLogger("yapflows.environment")


class Environment:
    """Domain class wrapping EnvironmentConfig."""

    def __init__(self, config: "EnvironmentConfig") -> None:
        self.config = config

    # ── Factories ──────────────────────────────────────────────────────────────

    @classmethod
    def load(cls, env_id: str, config: "Config") -> "Environment":
        """Load environment from user dir. Raises KeyError if not found."""
        from .models import EnvironmentConfig

        user_path = config.environments_dir / f"{env_id}.json"
        if user_path.exists():
            data = json.loads(user_path.read_text())
            return cls(config=EnvironmentConfig.model_validate(data))

        raise KeyError(f"Environment not found: {env_id}")

    @classmethod
    def list(cls, config: "Config") -> "list[Environment]":
        """All environments in the user environments directory."""
        from .models import EnvironmentConfig

        environments: list["Environment"] = []

        if config.environments_dir.exists():
            for path in sorted(config.environments_dir.glob("*.json")):
                try:
                    data = json.loads(path.read_text())
                    env_config = EnvironmentConfig.model_validate(data)
                    environments.append(cls(config=env_config))
                except Exception as e:
                    log.warning("Failed to load environment %s: %s", path.name, e)

        return environments

    @classmethod
    def resolve(cls, environment_id: "str | None", config: "Config") -> "Environment":
        """Resolve an environment by ID, falling back to the first available.

        Raises ValueError if no environments are configured at all.
        """
        env = None
        if environment_id:
            try:
                env = cls.load(environment_id, config)
            except KeyError:
                log.warning("Environment not found: %s, falling back to first available", environment_id)
        if env is None:
            envs = cls.list(config)
            env = envs[0] if envs else None
        if env is None:
            raise ValueError("No environments configured")
        return env

    @classmethod
    def save(cls, env_config: "EnvironmentConfig", config: "Config") -> "Environment":
        """Write user environment to ~/.yapflows/environments/{id}.json."""
        config.environments_dir.mkdir(parents=True, exist_ok=True)
        path = config.environments_dir / f"{env_config.id}.json"
        path.write_text(env_config.model_dump_json(indent=2))
        log.info("Saved environment  id=%s provider=%s model=%s", env_config.id, env_config.provider_id, env_config.model)
        return cls(config=env_config)

    @classmethod
    def delete(cls, env_id: str, config: "Config") -> None:
        """Delete an environment. Raises KeyError if not found."""
        user_path = config.environments_dir / f"{env_id}.json"
        if not user_path.exists():
            raise KeyError(f"Environment not found: {env_id}")
        user_path.unlink()
        log.info("Deleted environment  id=%s", env_id)

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def id(self) -> str:
        return self.config.id

    def __repr__(self) -> str:
        return f"Environment(id={self.id!r}, provider={self.config.provider_id!r}, model={self.config.model!r})"
