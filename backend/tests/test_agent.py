"""Tests for Agent domain class."""

import pytest
from pathlib import Path


def make_agent_md(directory: Path, name: str, provider: str = "claude-cli", model: str = "claude-opus-4-5", body: str = "You are helpful.") -> Path:
    """Create a test agent .md file."""
    content = f"""---
name: {name}
provider: {provider}
model: {model}
---

{body}
"""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{name.lower().replace(' ', '-')}.md"
    path.write_text(content)
    return path


def test_agent_load_builtin(tmp_path):
    """Agent.load() finds the built-in assistant agent."""
    from src.config import Config
    config = Config(base_dir=tmp_path)
    
    from src.core.agent import Agent
    agent = Agent.load("assistant", config)
    assert agent.id == "assistant"
    assert agent.config.builtin is True


def test_agent_load_user_override(tmp_path):
    """User agent overrides built-in with same name."""
    from src.config import Config
    config = Config(base_dir=tmp_path)
    
    # Create user agent with same name as built-in
    make_agent_md(config.agents_dir, "assistant", body="Custom prompt")
    
    from src.core.agent import Agent
    agent = Agent.load("assistant", config)
    assert "Custom prompt" in agent.config.system_prompt
    assert agent.config.builtin is False


def test_agent_load_not_found(tmp_path):
    """Agent.load() raises KeyError for unknown agent."""
    from src.config import Config
    config = Config(base_dir=tmp_path)
    
    from src.core.agent import Agent
    with pytest.raises(KeyError):
        Agent.load("nonexistent-agent-xyz", config)


def test_agent_list_includes_builtin(tmp_path):
    """Agent.list() returns at least the built-in assistant."""
    from src.config import Config
    config = Config(base_dir=tmp_path)
    
    from src.core.agent import Agent
    agents = Agent.list(config)
    ids = [a.id for a in agents]
    assert "assistant" in ids


def test_agent_build_system_prompt_no_memory(tmp_path):
    """build_system_prompt() works even without default.md."""
    from src.config import Config
    from src.core.agent import Agent
    from src.core.models import AgentConfig
    config_obj = AgentConfig(
        id="test",
        name="Test",
        provider_id="claude-cli",
        model="mock",
        system_prompt="You are a test agent.",
    )
    cfg = Config(base_dir=tmp_path)

    agent = Agent(config=config_obj, cfg=cfg)
    prompt = agent.build_system_prompt()
    assert "You are a test agent." in prompt


def test_agent_build_system_prompt_with_memory(tmp_path):
    """build_system_prompt() includes default.md content."""
    from src.config import Config
    from src.core.agent import Agent
    from src.core.models import AgentConfig
    config_obj = AgentConfig(
        id="test",
        name="Test",
        provider_id="claude-cli",
        model="mock",
        system_prompt="You are a test agent.",
    )
    cfg = Config(base_dir=tmp_path)
    (cfg.memory_dir / "default.md").write_text("User prefers dark mode.\nWorks at Acme.")

    agent = Agent(config=config_obj, cfg=cfg)
    prompt = agent.build_system_prompt()
    assert "You are a test agent." in prompt
    assert "User prefers dark mode." in prompt
