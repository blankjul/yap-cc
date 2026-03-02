"""Setup wizard API routes."""

from __future__ import annotations

import subprocess

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class TestProviderBody(BaseModel):
    provider_id: str
    api_key: str | None = None


class CompleteSetupBody(BaseModel):
    openrouter_api_key: str | None = None
    name: str | None = None
    timezone: str | None = None
    what_you_do: str | None = None
    preferences: str | None = None


@router.get("/setup/status")
async def setup_status(request: Request):
    from ...core.models import SetupStatus
    config = request.app.state.config
    return SetupStatus(required=config.setup_required).model_dump()


@router.post("/setup/test-provider")
async def test_provider(body: TestProviderBody):
    from ...core.models import ProviderTestResult

    if body.provider_id == "claude-cli":
        try:
            result = subprocess.run(
                ["claude", "--version"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                return ProviderTestResult(ok=True).model_dump()
            return ProviderTestResult(ok=False, error=result.stderr or "non-zero exit").model_dump()
        except FileNotFoundError:
            return ProviderTestResult(ok=False, error="claude CLI not found in PATH").model_dump()
        except subprocess.TimeoutExpired:
            return ProviderTestResult(ok=False, error="timeout").model_dump()
        except Exception as e:
            return ProviderTestResult(ok=False, error=str(e)).model_dump()

    elif body.provider_id == "openrouter":
        if not body.api_key:
            return ProviderTestResult(ok=False, error="API key required").model_dump()
        try:
            import httpx
            r = httpx.get(
                "https://openrouter.ai/api/v1/auth/key",
                headers={"Authorization": f"Bearer {body.api_key}"},
                timeout=10,
            )
            if r.status_code == 200:
                return ProviderTestResult(ok=True).model_dump()
            return ProviderTestResult(ok=False, error=f"Invalid API key (HTTP {r.status_code})").model_dump()
        except Exception as e:
            return ProviderTestResult(ok=False, error=str(e)).model_dump()

    return ProviderTestResult(ok=False, error=f"Unknown provider: {body.provider_id}").model_dump()


@router.post("/setup/complete")
async def complete_setup(body: CompleteSetupBody, request: Request):
    config = request.app.state.config

    # Save API keys
    if body.openrouter_api_key:
        config.set("providers.openrouter.api_key", body.openrouter_api_key)

    # Seed default.md memory
    memory_parts = []
    if body.name:
        memory_parts.append(f"Name: {body.name}")
    if body.timezone:
        memory_parts.append(f"Timezone: {body.timezone}")
    if body.what_you_do:
        memory_parts.append(f"What they do: {body.what_you_do}")
    if body.preferences:
        memory_parts.append(f"Preferences: {body.preferences}")

    if memory_parts:
        default_md = config.memory_dir / "default.md"
        content = "# About the User\n\n" + "\n".join(memory_parts) + "\n"
        default_md.write_text(content)

    # Mark setup done (save settings file)
    config.save()

    return {"ok": True}
