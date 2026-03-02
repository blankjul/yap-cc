"""Settings CRUD routes."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class TelegramChat(BaseModel):
    name: str
    chat_id: str


class TelegramSettings(BaseModel):
    bot_token: str | None = None
    chats: list[TelegramChat] | None = None


class SettingsPatch(BaseModel):
    main_agent_id: str | None = None
    main_session_id: str | None = None
    telegram: TelegramSettings | None = None


@router.get("/settings")
async def get_settings(request: Request):
    config = request.app.state.config
    tg_token = config.get("integrations.telegram.bot_token", "") or ""
    tg_chats = config.get("integrations.telegram.chats", []) or []
    return {
        "main_agent_id": config.main_agent_id,
        "main_session_id": config.main_session_id,
        "telegram": {
            "bot_token": tg_token,
            "chats": tg_chats,
        },
    }


@router.patch("/settings")
async def patch_settings(body: SettingsPatch, request: Request):
    config = request.app.state.config

    if "main_agent_id" in body.model_fields_set:
        config.set("main_agent_id", body.main_agent_id or None)

    if "main_session_id" in body.model_fields_set:
        config.set("main_session_id", body.main_session_id or None)

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
        config.save()

    return {"ok": True}
