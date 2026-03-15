from __future__ import annotations
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import graph, simulation, system
from app.api.websockets.sim_socket import router as ws_router


def get_static_dir() -> str:
    if getattr(sys, "frozen", False):
        # Running as PyInstaller bundle
        base = sys._MEIPASS  # type: ignore[attr-defined]
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "static")


def create_app() -> FastAPI:
    app = FastAPI(title="MfgSim", version="0.1.0")
    app.state.shutdown_handler = None

    # Allow React dev server during development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8765",
            "http://127.0.0.1:8765",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(simulation.router)
    app.include_router(graph.router)
    app.include_router(system.router)
    app.include_router(ws_router)

    # Serve React SPA (only if the static dir exists — i.e. production build)
    static_dir = get_static_dir()
    if os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    return app


app = create_app()
