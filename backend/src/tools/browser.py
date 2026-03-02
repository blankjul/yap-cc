"""
Browser automation tool for Yapflows v2 (openrouter provider).

Requires playwright. Install with: playwright install chromium
"""

from __future__ import annotations

import logging

log = logging.getLogger("yapflows.tool")

try:
    from strands import tool
    from playwright.sync_api import sync_playwright

    _browser = None
    _page = None

    def _get_page():
        global _browser, _page
        if _page is None:
            pw = sync_playwright().start()
            _browser = pw.chromium.launch(headless=True)
            _page = _browser.new_page()
        return _page

    @tool
    def browser_tool(action: str, target: str = "") -> str:
        """
        Control a headless browser for web automation.
        
        Actions:
          navigate <url>   — Go to URL, return title + URL
          get_text         — Get visible text of current page
          click <selector> — Click an element by CSS selector
          screenshot       — Take screenshot (returns file path)
        
        Args:
            action: The action to perform (navigate, get_text, click, screenshot)
            target: URL or CSS selector depending on action
            
        Returns:
            Result of the action as text
        """
        log.info("Tool called  tool=browser action=%s target=%s", action, target[:80] if target else "")
        
        try:
            page = _get_page()
            
            if action == "navigate":
                page.goto(target, timeout=15000)
                title = page.title()
                log.info("Tool done  tool=browser action=navigate title=%s", title[:50])
                return f"Navigated to: {page.url}\nTitle: {title}"
            
            elif action == "get_text":
                text = page.inner_text("body")
                # Truncate to first 3000 chars
                if len(text) > 3000:
                    text = text[:3000] + "\n...(truncated)"
                log.info("Tool done  tool=browser action=get_text chars=%d", len(text))
                return text
            
            elif action == "click":
                page.click(target)
                log.info("Tool done  tool=browser action=click selector=%s", target[:50])
                return f"Clicked: {target}"
            
            elif action == "screenshot":
                import tempfile, os
                path = os.path.join(tempfile.gettempdir(), "yapflows_screenshot.png")
                page.screenshot(path=path)
                log.info("Tool done  tool=browser action=screenshot path=%s", path)
                return f"Screenshot saved: {path}"
            
            else:
                return f"Unknown action: {action}. Use: navigate, get_text, click, screenshot"
        
        except Exception as e:
            log.error("Tool error  tool=browser error=%s", e)
            return f"Browser error: {e}"

except ImportError:
    def browser_tool(action: str, target: str = "") -> str:  # type: ignore[misc]
        """Browser tool (playwright or strands not available)."""
        return "Error: browser tool requires playwright and strands-agents"
