"""Pytest fixtures for integration tests."""

import os
import shutil
import tempfile
from pathlib import Path
from typing import Generator

import pytest


@pytest.fixture
def isolated_yapflows_dir(monkeypatch) -> Generator[Path, None, None]:
    """
    Create a temporary isolated ~/.yapflows/ directory for tests.

    Automatically cleans up after the test completes.
    """
    with tempfile.TemporaryDirectory(prefix="yapflows-test-") as tmpdir:
        test_dir = Path(tmpdir)

        # Create expected subdirectories
        (test_dir / "agents").mkdir()
        (test_dir / "chats").mkdir()
        (test_dir / "environments").mkdir()
        (test_dir / "knowledge").mkdir()
        (test_dir / "log").mkdir()
        (test_dir / "skills").mkdir()
        (test_dir / "tools").mkdir()

        # Monkeypatch environment variable to use test directory
        monkeypatch.setenv("YAPFLOWS_DIR", str(test_dir))

        # Also monkeypatch Path.home() so config uses the test directory
        original_home = Path.home()

        def mock_home():
            return test_dir.parent

        monkeypatch.setattr(Path, "home", mock_home)

        yield test_dir


@pytest.fixture
def test_env(isolated_yapflows_dir, monkeypatch):
    """
    Set up test environment variables to use mocked services.

    This ensures tests don't hit real external APIs.
    """
    # Clear API keys to force use of mock providers
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    # Set test environment flag
    monkeypatch.setenv("YAPFLOWS_TEST", "1")

    return isolated_yapflows_dir


@pytest.fixture
def minimal_requirements(isolated_yapflows_dir) -> Path:
    """
    Create a minimal requirements.txt in the test tools directory.

    This avoids downloading large packages during tests.
    """
    tools_dir = isolated_yapflows_dir / "tools"
    requirements = tools_dir / "requirements.txt"

    # Minimal requirements for testing (no playwright, no large packages)
    requirements.write_text(
        """# Minimal test requirements
httpx>=0.26.0
aiofiles>=23.0.0
PyYAML>=6.0
"""
    )

    return requirements


@pytest.fixture
def mock_openrouter(monkeypatch):
    """
    Mock httpx requests to OpenRouter API.

    Returns fake responses without making real API calls (zero token usage).
    """
    from unittest.mock import AsyncMock, MagicMock

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "id": "test-id",
        "model": "test-model",
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Mock response from OpenRouter",
                }
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_response

    # Monkeypatch httpx.AsyncClient
    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: mock_client)

    return mock_client


@pytest.fixture
def mock_subprocess(monkeypatch):
    """
    Mock subprocess calls to prevent real CLI execution.

    Useful for mocking Claude CLI, playwright install, etc.
    """
    from unittest.mock import MagicMock

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "Mock output"
    mock_result.stderr = ""

    mock_run = MagicMock(return_value=mock_result)
    monkeypatch.setattr("subprocess.run", mock_run)

    return mock_run


@pytest.fixture
def skip_playwright_install(monkeypatch):
    """
    Skip playwright browser install during tests (too slow).

    Creates the sentinel file so the install is skipped.
    """

    def mock_ensure_venv(config):
        """Mock venv setup that skips playwright install."""
        from src.core.venv_setup import ensure_tools_venv as original_ensure_venv
        import sys

        # Call original but skip playwright check
        venv_dir = config.base_dir / "venv"

        # Create sentinel to skip playwright install
        playwright_sentinel = venv_dir / ".playwright_ready"
        playwright_sentinel.parent.mkdir(parents=True, exist_ok=True)
        playwright_sentinel.touch()

        # Then call original (which will see sentinel and skip install)
        original_ensure_venv(config)

    monkeypatch.setattr("src.core.venv_setup.ensure_tools_venv", mock_ensure_venv)
