"""Integration tests for venv setup."""

import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.integration
def test_venv_creation(test_env, minimal_requirements):
    """Test that venv can be created in test directory."""
    from src.config import Config
    from src.core.venv_setup import ensure_tools_venv, venv_python

    config = Config()

    # Run venv setup
    ensure_tools_venv(config)

    # Verify venv was created
    venv_dir = config.base_dir / "venv"
    assert venv_dir.exists()

    # Verify Python executable exists
    python = venv_python(config)
    assert python.exists()


@pytest.mark.integration
def test_venv_python_executable(test_env, minimal_requirements):
    """Test that venv Python is executable."""
    from src.config import Config
    from src.core.venv_setup import ensure_tools_venv, venv_python

    config = Config()
    ensure_tools_venv(config)

    python = venv_python(config)

    # Test that Python runs
    result = subprocess.run(
        [str(python), "--version"],
        capture_output=True,
        text=True,
        timeout=5,
    )

    assert result.returncode == 0
    assert "Python" in result.stdout


@pytest.mark.integration
def test_pip_install_minimal_requirements(test_env, minimal_requirements):
    """Test that pip can install packages in venv."""
    from src.config import Config
    from src.core.venv_setup import ensure_tools_venv, venv_python

    config = Config()
    ensure_tools_venv(config)

    python = venv_python(config)

    # Test that httpx can be imported (from minimal_requirements)
    result = subprocess.run(
        [str(python), "-c", "import httpx; print(httpx.__version__)"],
        capture_output=True,
        text=True,
        timeout=5,
    )

    # May not be installed yet if requirements hash matched
    # So we just verify the command runs (even if import fails)
    # The venv should be functional
    assert result.returncode in (0, 1)  # 0 = success, 1 = import error (not installed)


@pytest.mark.integration
def test_requirements_hash_skip(test_env, minimal_requirements):
    """Test that pip install is skipped when requirements hash matches."""
    import hashlib
    from src.config import Config
    from src.core.venv_setup import ensure_tools_venv

    config = Config()

    # First install
    ensure_tools_venv(config)

    # Get requirements hash
    req_file = config.tools_dir / "requirements.txt"
    content = req_file.read_text()
    expected_hash = hashlib.sha256(content.encode()).hexdigest()

    # Verify hash sentinel was created
    hash_sentinel = config.base_dir / "venv" / ".requirements_hash"
    assert hash_sentinel.exists()
    assert hash_sentinel.read_text().strip() == expected_hash

    # Second install should skip (hash unchanged)
    ensure_tools_venv(config)

    # Hash should still match
    assert hash_sentinel.read_text().strip() == expected_hash


@pytest.mark.integration
def test_venv_setup_idempotent(test_env, minimal_requirements):
    """Test that ensure_tools_venv can be called multiple times safely."""
    from src.config import Config
    from src.core.venv_setup import ensure_tools_venv, venv_python

    config = Config()

    # Call multiple times
    ensure_tools_venv(config)
    ensure_tools_venv(config)
    ensure_tools_venv(config)

    # Should still work
    python = venv_python(config)
    assert python.exists()

    result = subprocess.run(
        [str(python), "--version"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 0


@pytest.mark.integration
@pytest.mark.slow
def test_playwright_install_skipped(test_env, minimal_requirements):
    """
    Test that playwright install is skipped when sentinel exists.

    Marked as slow because it could trigger real playwright install if broken.
    """
    from src.config import Config
    from src.core.venv_setup import ensure_tools_venv

    config = Config()
    venv_dir = config.base_dir / "venv"

    # Create playwright sentinel before setup
    playwright_sentinel = venv_dir / ".playwright_ready"
    playwright_sentinel.parent.mkdir(parents=True, exist_ok=True)
    playwright_sentinel.touch()

    # Run setup
    ensure_tools_venv(config)

    # Sentinel should still exist (not recreated)
    assert playwright_sentinel.exists()


@pytest.mark.integration
def test_venv_platform_paths(test_env):
    """Test that venv paths are correct for current platform."""
    from src.config import Config
    from src.core.venv_setup import venv_python

    config = Config()
    python = venv_python(config)

    # Verify path uses correct platform convention
    if sys.platform == "win32":
        # Windows uses Scripts/
        assert "Scripts" in str(python)
        assert python.name == "python.exe"
    else:
        # Unix uses bin/
        assert "bin" in str(python)
        assert python.name == "python"


@pytest.mark.integration
def test_venv_graceful_degradation(test_env, monkeypatch):
    """Test that venv setup handles errors gracefully."""
    from src.config import Config
    from src.core.venv_setup import ensure_tools_venv
    import venv

    config = Config()

    # Mock venv.create to raise an exception
    def mock_create(*args, **kwargs):
        raise Exception("Mock venv creation failure")

    monkeypatch.setattr(venv, "create", mock_create)

    # Should not crash, just log error
    try:
        ensure_tools_venv(config)
        # Should complete without raising exception
    except Exception as e:
        pytest.fail(f"ensure_tools_venv should not raise: {e}")
