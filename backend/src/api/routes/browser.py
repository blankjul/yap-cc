"""
Browser control API endpoints.

Provides HTTP API for browser automation (navigate, click, screenshot, etc.)
Auto-starts VNC and browser services on first use.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

log = logging.getLogger("yapflows.api.browser")

router = APIRouter(prefix="/browser", tags=["browser"])


class NavigateRequest(BaseModel):
    url: str
    max_chars: int = 3000


class ClickRequest(BaseModel):
    selector: str
    max_chars: int = 3000


class ScrollRequest(BaseModel):
    direction: str  # up | down | top | bottom
    pixels: int = 600
    max_chars: int = 3000


class FillRequest(BaseModel):
    selector: str
    value: str
    max_chars: int = 3000


class NavigateResponse(BaseModel):
    url: str
    text: str
    vnc_url: Optional[str] = None


class TextResponse(BaseModel):
    url: str
    text: str


class StatusResponse(BaseModel):
    browser_active: bool
    vnc_active: bool
    vnc_url: Optional[str] = None
    current_url: Optional[str] = None


class EvaluateRequest(BaseModel):
    expression: str


class EvaluateResponse(BaseModel):
    result: object


class OkResponse(BaseModel):
    ok: bool


async def _ensure_services():
    """Ensure VNC and browser services are started."""
    from ...service.vnc_service import VncService
    from ...service.browser_service import BrowserService

    vnc = await VncService.get_instance()
    if not vnc.is_running():
        await vnc.start()

    browser = await BrowserService.get_instance()
    await browser.start()


@router.post("/navigate", response_model=NavigateResponse)
async def navigate(req: NavigateRequest):
    """Navigate to URL and return page text."""
    try:
        await _ensure_services()

        from ...service.browser_service import BrowserService
        from ...service.vnc_service import VncService

        browser = await BrowserService.get_instance()
        result = await browser.navigate(req.url, req.max_chars)

        vnc = await VncService.get_instance()
        vnc_url = vnc.get_vnc_url()

        return NavigateResponse(
            url=result["url"],
            text=result["text"],
            vnc_url=vnc_url,
        )

    except Exception as e:
        log.error("Navigate failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/click", response_model=TextResponse)
async def click(req: ClickRequest):
    """Click element and return updated page text."""
    try:
        await _ensure_services()

        from ...service.browser_service import BrowserService

        browser = await BrowserService.get_instance()
        result = await browser.click(req.selector, req.max_chars)

        return TextResponse(
            url=result["url"],
            text=result["text"],
        )

    except Exception as e:
        log.error("Click failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fill", response_model=TextResponse)
async def fill(req: FillRequest):
    """Fill a text input and return updated page text."""
    try:
        from ...service.browser_service import BrowserService

        browser = await BrowserService.get_instance()
        result = await browser.fill(req.selector, req.value, req.max_chars)

        return TextResponse(url=result["url"], text=result["text"])

    except Exception as e:
        log.error("Fill failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scroll", response_model=TextResponse)
async def scroll(req: ScrollRequest):
    """Scroll the page and return updated text."""
    try:
        from ...service.browser_service import BrowserService

        browser = await BrowserService.get_instance()
        result = await browser.scroll(req.direction, req.pixels, req.max_chars)

        return TextResponse(url=result["url"], text=result["text"])

    except Exception as e:
        log.error("Scroll failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/text", response_model=TextResponse)
async def get_text(max_chars: int = 3000):
    """Get current page text."""
    try:
        from ...service.browser_service import BrowserService

        browser = await BrowserService.get_instance()

        if not browser.is_running():
            raise HTTPException(
                status_code=400,
                detail="Browser not running. Navigate to a page first.",
            )

        text = await browser.get_text(max_chars)
        url = await browser.get_url()

        return TextResponse(url=url, text=text)

    except HTTPException:
        raise
    except Exception as e:
        log.error("Get text failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/screenshot")
async def screenshot():
    """Take screenshot and return PNG image."""
    try:
        await _ensure_services()

        from ...service.browser_service import BrowserService

        browser = await BrowserService.get_instance()
        png_bytes = await browser.screenshot()

        return Response(content=png_bytes, media_type="image/png")

    except Exception as e:
        log.error("Screenshot failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=StatusResponse)
async def status():
    """Get browser and VNC status."""
    try:
        from ...service.browser_service import BrowserService
        from ...service.vnc_service import VncService

        browser = await BrowserService.get_instance()
        vnc = await VncService.get_instance()

        browser_status = await browser.get_status()

        return StatusResponse(
            browser_active=browser_status["active"],
            vnc_active=vnc.is_running(),
            vnc_url=vnc.get_vnc_url(),
            current_url=browser_status["url"],
        )

    except Exception as e:
        log.error("Status check failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    """Evaluate JavaScript expression and return result."""
    try:
        from ...service.browser_service import BrowserService

        browser = await BrowserService.get_instance()
        result = await browser.evaluate(req.expression)

        return EvaluateResponse(result=result["result"])

    except Exception as e:
        log.error("Evaluate failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop", response_model=OkResponse)
async def stop_browser():
    """Stop browser (VNC service remains running)."""
    try:
        from ...service.browser_service import BrowserService

        browser = await BrowserService.get_instance()
        await browser.stop()

        return OkResponse(ok=True)

    except Exception as e:
        log.error("Stop browser failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
