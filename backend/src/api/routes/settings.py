"""Settings CRUD routes."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class TelegramChat(BaseModel):
    name: str
    chat_id: str
    agent_id: str | None = None
    environment_id: str | None = None


class TelegramSettings(BaseModel):
    bot_token: str | None = None
    chats: list[TelegramChat] | None = None


class UiSettings(BaseModel):
    leader_key: str | None = None
    leader_key_2: str | None = None


class SettingsPatch(BaseModel):
    telegram: TelegramSettings | None = None
    ui: UiSettings | None = None


@router.get("/settings")
async def get_settings(request: Request):
    config = request.app.state.config
    tg_token = config.get("integrations.telegram.bot_token", "") or ""
    tg_chats = config.get("integrations.telegram.chats", []) or []
    return {
        "telegram": {
            "bot_token": tg_token,
            "chats": tg_chats,
        },
        "ui": {
            "theme_color": config.get("ui.theme_color", "zinc") or "zinc",
            "leader_key": config.get("ui.leader_key", "\\") or "\\",
            "leader_key_2": config.get("ui.leader_key_2", "") or "",
        },
    }


@router.patch("/settings")
async def patch_settings(body: SettingsPatch, request: Request):
    config = request.app.state.config

    if body.telegram is not None:
        tg = body.telegram
        if tg.bot_token is not None:
            config.set("integrations.telegram.bot_token", tg.bot_token, save=False)
        if tg.chats is not None:
            config.set(
                "integrations.telegram.chats",
                [c.model_dump() for c in tg.chats],
                save=False,
            )

    if body.ui is not None:
        ui = body.ui
        if ui.leader_key is not None:
            config.set("ui.leader_key", ui.leader_key, save=False)
        if ui.leader_key_2 is not None:
            config.set("ui.leader_key_2", ui.leader_key_2, save=False)

    config.save()
    return {"ok": True}
