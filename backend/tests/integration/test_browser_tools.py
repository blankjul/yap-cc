"""Integration tests that verify the browser-based CLI tools actually work."""

import subprocess
from pathlib import Path

import pytest


def _playwright_launch_ok() -> tuple[bool, str]:
    """Try launching Chromium; return (ok, error_message)."""
    result = subprocess.run(
        [
            str(VENV_PYTHON), "-c",
            "from playwright.sync_api import sync_playwright; "
            "p = sync_playwright().start(); "
            "b = p.chromium.launch(); "
            "b.close(); p.stop(); print('ok')"
        ],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode == 0 and "ok" in result.stdout:
        return True, ""
    return False, result.stderr or result.stdout

VENV_PYTHON = Path.home() / ".yapflows" / "venv" / "bin" / "python"
TOOLS_DIR = Path.home() / ".yapflows" / "tools"


def run_tool(tool: str, *args: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(VENV_PYTHON), str(TOOLS_DIR / tool), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )


@pytest.mark.integration
def test_playwright_can_launch():
    """Verify Playwright can actually launch Chromium (catches missing system deps like libatk)."""
    ok, err = _playwright_launch_ok()
    assert ok, (
        f"Playwright failed to launch Chromium.\n{err}\n"
        "Fix: run `playwright install-deps chromium` inside the yapflows venv."
    )


@pytest.mark.integration
@pytest.mark.slow
def test_web_search_returns_results():
    """web_search.py returns at least one result for a basic query."""
    result = run_tool("web_search.py", "python programming language", "-n", "3")
    assert result.returncode == 0, f"web_search failed:\n{result.stderr}"
    assert len(result.stdout.strip()) > 0, "web_search returned no output"


@pytest.mark.integration
@pytest.mark.slow
def test_web_fetch_returns_content():
    """web_fetch.py fetches a URL and returns text content."""
    result = run_tool("web_fetch.py", "http://example.com", "--max-chars", "500")
    assert result.returncode == 0, f"web_fetch failed:\n{result.stderr}"
    assert len(result.stdout.strip()) > 0, "web_fetch returned no output"
    # Should not contain raw HTML tags
    assert "<html" not in result.stdout.lower()


@pytest.mark.integration
def test_chat_list_shows_sessions():
    """chat.py list command shows session history."""
    result = run_tool("chat.py", "list", "--last", "5")
    # Should succeed or return empty list (if no chats exist)
    assert result.returncode == 0, f"chat.py list failed:\n{result.stderr}"


@pytest.mark.integration
def test_chat_stats_returns_info():
    """chat.py stats command returns usage statistics."""
    result = run_tool("chat.py", "stats")
    # Should succeed even with no chats
    assert result.returncode == 0, f"chat.py stats failed:\n{result.stderr}"


@pytest.mark.integration
@pytest.mark.slow
def test_finance_price_returns_stock_data():
    """finance.py price command fetches stock data."""
    result = run_tool("finance.py", "price", "AAPL")
    assert result.returncode == 0, f"finance.py failed:\n{result.stderr}"
    assert len(result.stdout.strip()) > 0, "finance.py returned no output"
    # Should contain stock symbol
    assert "AAPL" in result.stdout.upper()


@pytest.mark.integration
def test_web_browser_help():
    """web_browser.py --help shows usage information."""
    result = run_tool("web_browser.py", "--help")
    assert result.returncode == 0, f"web_browser.py --help failed:\n{result.stderr}"
    assert "navigate" in result.stdout.lower()
    assert "click" in result.stdout.lower()
    assert "screenshot" in result.stdout.lower()
