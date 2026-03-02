"""Trigger webhook route."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.post("/triggers/{name}")
async def fire_trigger(name: str, request: Request):
    config = request.app.state.config
    store = request.app.state.store
    from ...service.triggers import TriggerRegistry

    body_bytes = await request.body()
    payload = body_bytes.decode("utf-8", errors="replace")

    registry = TriggerRegistry(config=config, store=store)
    try:
        registry.dispatch(name, payload)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {"ok": True}
