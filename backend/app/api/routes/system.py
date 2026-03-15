from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request

from app.api.routes.simulation import stop_active_engine

router = APIRouter(prefix="/api/system")


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/shutdown")
async def shutdown(request: Request):
    shutdown_handler = getattr(request.app.state, "shutdown_handler", None)
    if shutdown_handler is None:
        raise HTTPException(status_code=503, detail="Shutdown is not available in this launch mode.")

    stop_active_engine()

    loop = asyncio.get_running_loop()
    loop.call_later(0.25, shutdown_handler)
    return {"status": "shutting_down"}
