"""
Ensure a dedicated Python venv exists at ~/.yapflows/venv/ with all tool dependencies.

Called at server startup — fast path when already set up (hash-gated pip, sentinel-gated
playwright browser install).
"""

from __future__ import annotations

import hashlib
import logging
import subprocess
import sys
import venv as _venv
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import Config

log = logging.getLogger("yapflows.venv")


def venv_python(config: "Config") -> Path:
    """Return path to the venv python (platform-agnostic)."""
    venv_dir = config.base_dir / "venv"

    # Windows uses Scripts/, Unix uses bin/
    if sys.platform == "win32":
        return venv_dir / "Scripts" / "python.exe"
    else:
        return venv_dir / "bin" / "python"


def ensure_tools_venv(config: "Config") -> None:
    """
    Create ~/.yapflows/venv/ if missing, install tool requirements if changed,
    and install playwright chromium once (sentinel-gated).

    Idempotent — safe to call on every server startup.
    """
    venv_dir = config.base_dir / "venv"

    # Use platform-agnostic paths
    if sys.platform == "win32":
        python = venv_dir / "Scripts" / "python.exe"
        pip = venv_dir / "Scripts" / "pip.exe"
        playwright_bin = venv_dir / "Scripts" / "playwright.exe"
    else:
        python = venv_dir / "bin" / "python"
        pip = venv_dir / "bin" / "pip"
        playwright_bin = venv_dir / "bin" / "playwright"

    # 1. Create venv if missing
    if not python.exists():
        log.info("Creating tools venv at %s", venv_dir)
        log.debug("Python version: %s", sys.version)
        log.debug("Platform: %s", sys.platform)
        try:
            _venv.create(str(venv_dir), with_pip=True)
            log.info("Venv created successfully")

            # Validate venv creation
            if not python.exists():
                log.error("Venv creation appeared to succeed but Python not found at %s", python)
                return

            # Test that the Python executable works
            try:
                result = subprocess.run(
                    [str(python), "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if result.returncode == 0:
                    log.info("Venv Python is executable: %s", result.stdout.strip())
                else:
                    log.error("Venv Python is not executable: %s", result.stderr)
                    return
            except Exception as e:
                log.error("Failed to execute venv Python: %s", e)
                return

        except Exception as e:
            log.error("Failed to create tools venv: %s", e, exc_info=True)
            log.error("This may be due to missing python3-venv package on Linux")
            log.error("Install with: sudo apt-get install python3-venv")
            return

    # 2. Install requirements if requirements.txt exists and changed
    req_file = config.tools_dir / "requirements.txt"
    if req_file.exists():
        _install_if_changed(pip, req_file, venv_dir)
    else:
        log.debug("No requirements.txt in tools_dir, skipping pip install")

    # 3. Install playwright chromium once (sentinel-gated)
    playwright_sentinel = venv_dir / ".playwright_ready"
    if playwright_bin.exists() and not playwright_sentinel.exists():
        log.info("Installing playwright chromium (one-time setup, ~200MB download)...")
        log.info("This may take several minutes...")
        try:
            result = subprocess.run(
                [str(playwright_bin), "install", "chromium"],
                capture_output=True,
                text=True,
                timeout=600,  # Increased timeout for large download
            )
            if result.returncode == 0:
                playwright_sentinel.touch()
                log.info("Playwright chromium installed successfully")
            else:
                log.warning("playwright install chromium failed: %s", result.stderr[:500])
                log.warning("Browser tools may not work until this succeeds")
        except subprocess.TimeoutExpired:
            log.warning("playwright install chromium timed out after 10 minutes")
            log.warning("Browser tools may not work until this succeeds")
        except Exception as e:
            log.error("playwright install chromium error: %s", e, exc_info=True)
            log.warning("Browser tools may not work until this succeeds")


def _install_if_changed(pip: Path, req_file: Path, venv_dir: Path) -> None:
    """Run pip install only when requirements.txt has changed since last install."""
    content = req_file.read_text(errors="replace")
    current_hash = hashlib.sha256(content.encode()).hexdigest()

    hash_sentinel = venv_dir / ".requirements_hash"
    if hash_sentinel.exists() and hash_sentinel.read_text().strip() == current_hash:
        log.debug("Tool requirements unchanged, skipping pip install")
        return

    log.info("Installing tool requirements from %s", req_file)
    log.debug("Requirements hash: %s", current_hash[:12])

    # Validate pip exists
    if not pip.exists():
        log.error("Pip not found at %s, cannot install requirements", pip)
        return

    try:
        result = subprocess.run(
            [str(pip), "install", "-q", "-r", str(req_file)],
            capture_output=True,
            text=True,
            timeout=180,  # Increased timeout for slower networks
        )
        if result.returncode == 0:
            hash_sentinel.write_text(current_hash)
            log.info("Tool requirements installed successfully")
        else:
            log.error("pip install failed with exit code %d", result.returncode)
            log.error("stderr: %s", result.stderr[:500])
            log.error("stdout: %s", result.stdout[:500])
    except subprocess.TimeoutExpired:
        log.error("pip install timed out after 3 minutes")
        log.error("Check network connection or increase timeout")
    except Exception as e:
        log.error("pip install error: %s", e, exc_info=True)
