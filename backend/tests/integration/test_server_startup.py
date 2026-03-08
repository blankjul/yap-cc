"""Integration tests for server startup and lifespan."""

import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_config_loads_successfully(test_env):
    """Test that config loads and creates required directories."""
    from src.config import Config

    config = Config()

    # Verify config loaded
    assert config.base_dir.exists()
    assert config.base_dir.name.startswith("yapflows-test-") or ".yapflows" in str(config.base_dir)

    # Verify subdirectories exist
    assert config.agents_dir.exists()
    assert config.chats_dir.exists()
    assert config.tools_dir.exists()
    assert config.log_dir.exists()


@pytest.mark.integration
def test_config_creates_default_settings(test_env):
    """Test that config loads default settings if file missing."""
    from src.config import Config

    config = Config()

    # Should load default settings in memory (even if file doesn't exist)
    assert config._settings is not None
    assert isinstance(config._settings, dict)
    assert "version" in config._settings
    assert "providers" in config._settings


@pytest.mark.integration
def test_session_store_initializes(test_env):
    """Test that session store initializes and can save/load sessions."""
    from datetime import datetime
    from src.config import Config
    from src.core.session import FileSessionStore, _new_session_id
    from src.core.models import SessionState

    config = Config()
    store = FileSessionStore(chats_dir=config.chats_dir)

    # Create a test session state
    session_id = _new_session_id()
    now = datetime.now()
    state = SessionState(
        id=session_id,
        title="Test Session",
        agent_id="test-agent",
        provider_id="claude-cli",
        model="claude-3-5-sonnet-20241022",
        created_at=now,
        updated_at=now,
    )

    # Save it
    store.save(state)

    # Verify we can retrieve it
    loaded_state = store.load(session_id)
    assert loaded_state is not None
    assert loaded_state.title == "Test Session"
    assert loaded_state.agent_id == "test-agent"


@pytest.mark.integration
def test_tools_discovery(test_env):
    """Test that tools can be discovered from tools directory."""
    from src.config import Config
    from src.core.tool import Tool

    config = Config()

    # Create a test tool (must have # description: comment)
    tools_dir = config.tools_dir
    test_tool = tools_dir / "test_tool.py"
    test_tool.write_text(
        '''#!/usr/bin/env python3
# description: Test tool for integration tests
# usage: test_tool.py

"""Test tool for integration tests."""

def main():
    print("Test tool executed")

if __name__ == "__main__":
    main()
'''
    )
    test_tool.chmod(0o755)

    # Discover tools
    tools = Tool.list(config)

    # Should find our test tool
    tool_names = [t.config.name for t in tools]
    assert "test_tool" in tool_names


@pytest.mark.integration
def test_health_endpoint_responds(test_env, minimal_requirements):
    """Test that /health endpoint returns 200."""
    # Import after setting up test_env
    from src.server import app

    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200


@pytest.mark.integration
@pytest.mark.asyncio
async def test_server_lifespan_completes(test_env, minimal_requirements, monkeypatch):
    """
    Test that server lifespan completes all 12 steps successfully.

    Uses mocked providers to avoid real API calls (zero token usage).
    """
    from src.server import lifespan
    from fastapi import FastAPI

    # Skip playwright install (too slow for tests)
    def mock_ensure_venv(config):
        """Mock venv setup that skips playwright install."""
        import sys
        from pathlib import Path

        venv_dir = config.base_dir / "venv"

        # Create venv structure
        if sys.platform == "win32":
            bin_dir = venv_dir / "Scripts"
        else:
            bin_dir = venv_dir / "bin"

        bin_dir.mkdir(parents=True, exist_ok=True)

        # Create dummy Python and pip executables
        python = bin_dir / ("python.exe" if sys.platform == "win32" else "python")
        pip = bin_dir / ("pip.exe" if sys.platform == "win32" else "pip")

        python.touch()
        pip.touch()
        python.chmod(0o755)
        pip.chmod(0o755)

        # Create sentinels to skip installs
        (venv_dir / ".requirements_hash").write_text("test-hash")
        (venv_dir / ".playwright_ready").touch()

    monkeypatch.setattr("src.core.venv_setup.ensure_tools_venv", mock_ensure_venv)

    # Create a minimal app
    app = FastAPI(lifespan=lifespan)

    # Run lifespan context
    async with lifespan(app):
        # Verify state was set up
        assert hasattr(app.state, "config")
        assert hasattr(app.state, "store")
        assert hasattr(app.state, "queue")
        assert hasattr(app.state, "tasks")
        assert hasattr(app.state, "scheduler")
        assert hasattr(app.state, "messaging")

        # Verify config is valid
        assert app.state.config.base_dir.exists()

        # Verify store works (save/load a session state)
        from datetime import datetime
        from src.core.models import SessionState
        from src.core.session import _new_session_id

        session_id = _new_session_id()
        now = datetime.now()
        state = SessionState(
            id=session_id,
            title="Test",
            agent_id="test",
            provider_id="claude-cli",
            model="claude-3-5-sonnet-20241022",
            created_at=now,
            updated_at=now,
        )
        app.state.store.save(state)
        loaded = app.state.store.load(session_id)
        assert loaded is not None

        # Verify queue exists
        assert app.state.queue is not None

    # Lifespan shutdown completed successfully (no exception raised)


@pytest.mark.integration
def test_venv_python_helper(test_env):
    """Test that venv_python() returns correct path for platform."""
    from src.config import Config
    from src.core.venv_setup import venv_python
    import sys

    config = Config()
    python_path = venv_python(config)

    # Should use correct subdirectory for platform
    if sys.platform == "win32":
        assert "Scripts" in str(python_path)
        assert python_path.name == "python.exe"
    else:
        assert "bin" in str(python_path)
        assert python_path.name == "python"
