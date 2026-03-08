"""
Browser service manager for yapflows.

Manages a singleton Playwright browser instance with persistent profile.
Browser runs in headed mode on virtual display (:99) for VNC viewing.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Optional

log = logging.getLogger("yapflows.browser")


class BrowserService:
    """Singleton browser service managing Playwright browser instance."""

    _instance: Optional[BrowserService] = None
    _lock = asyncio.Lock()

    def __init__(self):
        self.context = None
        self.page = None
        self._playwright_obj = None

    @classmethod
    async def get_instance(cls) -> BrowserService:
        """Get or create the singleton browser service instance."""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = BrowserService()
            return cls._instance

    def is_running(self) -> bool:
        """Check if browser is running."""
        return self.context is not None and self.page is not None

    async def start(self) -> None:
        """
        Start browser if not already running.
        Browser launches with DISPLAY=:99 and headless=False for VNC viewing.
        """
        if self.is_running():
            log.debug("Browser already running")
            return

        log.info("Starting browser")

        try:
            from playwright.async_api import async_playwright

            # Determine profile directory
            base = os.getenv("USER_DIR")
            if base:
                root = Path(base).expanduser()
            else:
                root = Path.home() / "yapflows"

            profile_dir = root / "data" / "browser" / "profile"
            profile_dir.mkdir(parents=True, exist_ok=True)

            # Remove stale singleton locks left by crashed Chromium instances
            for lock in profile_dir.glob("Singleton*"):
                try:
                    lock.unlink()
                    log.debug("Removed stale lock: %s", lock.name)
                except Exception:
                    pass

            log.debug("Browser profile directory: %s", profile_dir)

            # Set up environment with virtual display
            env = os.environ.copy()
            env["DISPLAY"] = os.getenv("DISPLAY_NUMBER", ":99")

            # Launch Playwright
            self._playwright_obj = await async_playwright().start()

            width = int(os.getenv("BROWSER_WIDTH", "1280"))
            height = int(os.getenv("BROWSER_HEIGHT", "720"))

            # Use real system Chromium so Google doesn't block login
            # (Playwright's bundled Chromium is on Google's blocklist)
            chromium_bin = os.getenv("CHROMIUM_BIN", "/usr/bin/chromium-browser")

            self.context = await self._playwright_obj.chromium.launch_persistent_context(
                user_data_dir=str(profile_dir),
                executable_path=chromium_bin,
                headless=False,
                env=env,
                viewport={"width": width, "height": height},
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--lang=en-US,en;q=0.9",
                ],
                ignore_default_args=[
                    "--enable-automation",
                    "--disable-component-extensions-with-background-pages",
                ],
            )

            # Create initial page
            self.page = await self.context.new_page()

            log.info("Browser started (system Chromium, persistent profile)")

        except Exception as e:
            log.error("Failed to start browser: %s", e)
            await self.stop()
            raise

    async def stop(self) -> None:
        """Stop browser and clean up resources."""
        log.info("Stopping browser")

        # Close context (cookies/profile are persisted to disk automatically)
        if self.context:
            try:
                await self.context.close()
            except Exception as e:
                log.error("Error closing browser context: %s", e)

        # Stop Playwright
        if self._playwright_obj:
            try:
                await self._playwright_obj.stop()
            except Exception as e:
                log.error("Error stopping Playwright: %s", e)

        self.page = None
        self.context = None
        self._playwright_obj = None

        log.info("Browser stopped")

    async def navigate(self, url: str, max_chars: int = 3000) -> dict:
        """
        Navigate to URL and return page text.
        Returns: {"url": str, "text": str}
        """
        await self.start()

        log.debug("Navigating to %s", url)
        await self.page.goto(url, wait_until="domcontentloaded", timeout=20000)

        try:
            await self.page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass

        text = await self.page.inner_text("body")
        current_url = self.page.url

        if len(text) > max_chars:
            text = text[:max_chars] + f"\n...(truncated, {len(text) - max_chars} chars omitted)"

        return {"url": current_url, "text": text}

    async def click(self, selector: str, max_chars: int = 3000) -> dict:
        """
        Click element and return updated page text.
        Returns: {"url": str, "text": str}
        """
        await self.start()

        log.debug("Clicking selector: %s", selector)
        await self.page.click(selector, timeout=10000)

        try:
            await self.page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass

        text = await self.page.inner_text("body")
        current_url = self.page.url

        if len(text) > max_chars:
            text = text[:max_chars] + f"\n...(truncated, {len(text) - max_chars} chars omitted)"

        return {"url": current_url, "text": text}

    async def fill(self, selector: str, value: str, max_chars: int = 3000) -> dict:
        """
        Fill a text input and return updated page text.
        Returns: {"url": str, "text": str}
        """
        if not self.is_running():
            raise RuntimeError("Browser not running. Navigate to a page first.")

        log.debug("Filling selector %s with %r", selector, value)
        await self.page.fill(selector, value, timeout=10000)

        try:
            await self.page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass

        text = await self.page.inner_text("body")
        if len(text) > max_chars:
            text = text[:max_chars] + f"\n...(truncated, {len(text) - max_chars} chars omitted)"

        return {"url": self.page.url, "text": text}

    async def scroll(self, direction: str, pixels: int = 600, max_chars: int = 3000) -> dict:
        """
        Scroll the page and return updated text.
        direction: 'up' | 'down' | 'top' | 'bottom'
        pixels: how far to scroll (ignored for top/bottom)
        """
        if not self.is_running():
            raise RuntimeError("Browser not running. Navigate to a page first.")

        if direction == "top":
            await self.page.evaluate("window.scrollTo(0, 0)")
        elif direction == "bottom":
            await self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        elif direction == "down":
            await self.page.evaluate(f"window.scrollBy(0, {pixels})")
        elif direction == "up":
            await self.page.evaluate(f"window.scrollBy(0, -{pixels})")
        else:
            raise ValueError(f"Unknown scroll direction: {direction}")

        # Wait briefly for lazy-loaded content
        try:
            await self.page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass

        text = await self.page.inner_text("body")
        if len(text) > max_chars:
            text = text[:max_chars] + f"\n...(truncated, {len(text) - max_chars} chars omitted)"

        return {"url": self.page.url, "text": text}

    async def get_text(self, max_chars: int = 3000) -> str:
        """Get current page text."""
        if not self.is_running():
            raise RuntimeError("Browser not running. Navigate to a page first.")

        text = await self.page.inner_text("body")

        if len(text) > max_chars:
            text = text[:max_chars] + f"\n...(truncated, {len(text) - max_chars} chars omitted)"

        return text

    async def screenshot(self) -> bytes:
        """Take screenshot and return PNG bytes."""
        if not self.is_running():
            raise RuntimeError("Browser not running. Navigate to a page first.")

        return await self.page.screenshot(type="png", full_page=True)

    async def evaluate(self, expression: str) -> dict:
        """Evaluate JavaScript expression and return result."""
        if not self.is_running():
            raise RuntimeError("Browser not running. Navigate to a page first.")

        result = await self.page.evaluate(expression)
        return {"result": result}

    async def get_url(self) -> str:
        """Get current URL."""
        if not self.is_running():
            raise RuntimeError("Browser not running")

        return self.page.url

    async def get_status(self) -> dict:
        """Get browser status."""
        return {
            "active": self.is_running(),
            "url": self.page.url if self.is_running() else None,
        }
