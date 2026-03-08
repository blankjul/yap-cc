"""
Shared pytest fixtures for Yapflows v2 tests.
"""

import pytest
from pathlib import Path


@pytest.fixture
def tmp_config(tmp_path):
    """A Config instance using tmp_path as base_dir."""
    from src.config import Config
    return Config(base_dir=tmp_path)


@pytest.fixture
def memory_dir(tmp_path):
    """An empty memory directory."""
    d = tmp_path / "memory"
    d.mkdir()
    return d


@pytest.fixture
def mock_agent_config():
    """A minimal AgentConfig for testing."""
    from src.core.models import AgentConfig
    return AgentConfig(
        id="test-agent",
        name="Test Agent",
        provider_id="claude-cli",
        model="claude-opus-4-5",
        system_prompt="You are a test agent.",
    )
