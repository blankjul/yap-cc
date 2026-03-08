"""
FastAPI application entry point for Yapflows v2.

Startup: configure logging, load config, start scheduler, start queue worker.
Shutdown: stop scheduler, stop queue worker.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

log = logging.getLogger("yapflows.server")

# Global state
_config = None
_store = None
_scheduler = None
_queue = None
_queue_task = None
_tasks: dict = {}
_vnc_service = None
_browser_service = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _config, _store, _scheduler, _queue, _queue_task, _tasks, _vnc_service, _browser_service

    # 1. Load config  (get_config() keeps the singleton so handlers.py shares the same object)
    from .config import get_config
    import os
    _config = get_config()

    # 2. Configure logging
    from .logging_config import configure_logging
    log_file = configure_logging(_config)

    # Re-get logger after logging is configured
    logger = logging.getLogger("yapflows.server")

    # 2b. Run pre-flight checks (non-blocking warnings)
    from .preflight.validators import run_all_checks
    preflight_results = run_all_checks()
    for result in preflight_results:
        if not result.passed:
            if result.level == "error":
                logger.error("Pre-flight check failed: %s", result.message)
            elif result.level == "warning":
                logger.warning("Pre-flight check warning: %s", result.message)
        else:
            logger.debug("Pre-flight check passed: %s", result.message)

    # 3. Seed defaults + ensure tools venv (both idempotent)
    if _config.defaults_dir and _config.defaults_dir.exists():
        from .core.seed import seed_defaults
        seeded = seed_defaults(_config.defaults_dir, _config)
        if seeded:
            logger.info("Seeded %d default files to %s", seeded, _config.base_dir)
    from .core.venv_setup import ensure_tools_venv
    logger.info("Setting up tools venv...")
    ensure_tools_venv(_config)

    # Verify venv was created successfully
    from .core.venv_setup import venv_python
    venv_py = venv_python(_config)
    if venv_py.exists():
        logger.info("Tools venv ready at %s", venv_py.parent.parent)
    else:
        logger.error("Tools venv was not created successfully at %s", venv_py)
        logger.error("Tools may not work correctly")

    # Export path variables so bash subprocesses can use $PYTHON, $TOOLS, etc.
    from .core.shell_env import export as _export_shell_env, SHELL_VARS
    _export_shell_env(_config, venv_py)
    logger.info("Shell env vars set: %s", ", ".join(v.name for v in SHELL_VARS))

    # 3b. Store
    from .core.session import FileSessionStore
    _store = FileSessionStore(chats_dir=_config.chats_dir)

    # 4. Load tasks
    from .core.task import Task
    _tasks = {t.name: t for t in Task.list(_config)}

    # 5. Start task queue
    from .service.queue import TaskQueue
    _queue = TaskQueue()
    _queue_task = asyncio.create_task(
        _queue.worker(_store, _config)
    )

    # 6. Start scheduler
    from .service.scheduler import setup_scheduler, start_scheduler
    _scheduler = setup_scheduler(_config, _queue, _tasks)
    start_scheduler(_scheduler)

    # 7. Start external chat manager (Telegram, etc.)
    from .messaging.manager import ExternalChatManager, set_external_chat_manager
    from .messaging.telegram import TelegramProvider
    _messaging = ExternalChatManager(config=_config, store=_store)
    tg = TelegramProvider(config=_config)
    if tg.configured:
        _messaging.register(tg)

    # Start messaging with error handling - don't crash if Telegram fails
    try:
        await _messaging.start_all()
        logger.info("External messaging started successfully")
    except Exception as e:
        logger.error("Failed to start external messaging (Telegram): %s", e)
        logger.warning("Server will continue without Telegram integration")

    set_external_chat_manager(_messaging)
    app.state.messaging = _messaging

    # Wire chat tools base URL so they call the correct port
    from .tools.chat import set_chat_base_url
    port = int(os.getenv("PORT", "8000"))
    set_chat_base_url(f"http://localhost:{port}")

    from .core.agent import Agent
    logger.info("Started  host=localhost port=%d log=%s", port, log_file.name)
    logger.info("Agents loaded  count=%d", len(Agent.list(_config)))
    logger.info("Tasks registered  count=%d", len(_tasks))
    logger.info("Proactive tasks: %s", [n for n, t in _tasks.items() if t.config.session_mode == "proactive"])

    # 8. Initialize VNC and browser services (but don't start them yet - lazy start on first use)
    from .service.vnc_service import VncService
    from .service.browser_service import BrowserService
    _vnc_service = await VncService.get_instance()
    _browser_service = await BrowserService.get_instance()
    logger.info("VNC and browser services initialized (will start on first use)")

    # Store refs in app state
    app.state.config = _config
    app.state.store = _store
    app.state.queue = _queue
    app.state.tasks = _tasks
    app.state.scheduler = _scheduler
    app.state.vnc_service = _vnc_service
    app.state.browser_service = _browser_service

    yield

    # Shutdown
    logger.info("Shutting down...")

    # Stop browser and VNC services
    if _browser_service and _browser_service.is_running():
        await _browser_service.stop()
    if _vnc_service and _vnc_service.is_running():
        await _vnc_service.stop()

    await _messaging.stop_all()
    if _queue:
        _queue.stop()
    if _queue_task:
        _queue_task.cancel()
        try:
            await asyncio.wait_for(_queue_task, timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    from .service.scheduler import stop_scheduler
    stop_scheduler(_scheduler)
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(title="Yapflows", version="2.0.0", lifespan=lifespan)

    import os
    _cors = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in _cors.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health endpoint
    @app.get("/health")
    async def health():
        return {"status": "ok"}

    # API routes
    from .api.routes.agents import router as agents_router
    from .api.routes.environments import router as environments_router
    from .api.routes.sessions import router as sessions_router
    from .api.routes.memory import router as memory_router
    from .api.routes.knowledge import router as knowledge_router
    from .api.routes.tasks import router as tasks_router
    from .api.routes.skills import router as skills_router
    from .api.routes.triggers import router as triggers_router
    from .api.routes.setup import router as setup_router
    from .api.routes.files import router as files_router
    from .api.routes.settings import router as settings_router
    from .api.routes.heartbeat import router as heartbeat_router
    from .api.routes.browser import router as browser_router
    from .api.websocket.handlers import router as ws_router

    app.include_router(agents_router, prefix="/api")
    app.include_router(environments_router, prefix="/api")
    app.include_router(sessions_router, prefix="/api")
    app.include_router(memory_router, prefix="/api")
    app.include_router(knowledge_router, prefix="/api")
    app.include_router(tasks_router, prefix="/api")
    app.include_router(skills_router, prefix="/api")
    app.include_router(triggers_router, prefix="/api")
    app.include_router(files_router, prefix="/api")
    app.include_router(settings_router, prefix="/api")
    app.include_router(heartbeat_router, prefix="/api")
    app.include_router(browser_router, prefix="/api")
    app.include_router(setup_router)
    app.include_router(ws_router)

    # Serve built frontend static files (production)
    frontend_dist = Path(__file__).parent.parent.parent / "frontend" / ".next" / "static"
    if frontend_dist.exists():
        app.mount("/static", StaticFiles(directory=str(frontend_dist)), name="static")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    import os
    uvicorn.run(
        "src.server:app",
        host="0.0.0.0",
        port=8000,
        reload=os.getenv("DEV_MODE", "").lower() in ("1", "true"),
    )
