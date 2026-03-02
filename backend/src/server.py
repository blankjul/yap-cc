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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _config, _store, _scheduler, _queue, _queue_task, _tasks

    # 1. Load config  (get_config() keeps the singleton so handlers.py shares the same object)
    from .config import get_config
    import os
    _config = get_config()

    # 2. Configure logging
    from .logging_config import configure_logging
    log_file = configure_logging(_config)

    # Re-get logger after logging is configured
    logger = logging.getLogger("yapflows.server")

    # 3. Store
    from .core.session import FileSessionStore
    _store = FileSessionStore(chats_dir=_config.chats_dir)

    # 4. Load tasks
    from .core.task import Task
    _tasks = {t.name: t for t in Task.list(_config)}

    # 5. Start task queue
    from .service.queue import TaskQueue
    _queue = TaskQueue()
    _queue_task = asyncio.create_task(
        _queue.worker(_tasks, _store, _config)
    )

    # 6. Start scheduler
    from .service.scheduler import setup_scheduler, start_scheduler
    _scheduler = setup_scheduler(_config, _queue)
    start_scheduler(_scheduler)

    # 7. Auto-create main session if configured and none exists
    main_agent_id = _config.main_agent_id
    if main_agent_id:
        main_state = _store.get_main(_config.main_session_id)
        if not main_state:
            try:
                from .core.agent import Agent
                from .core.session import Session
                main_agent = Agent.load(main_agent_id, _config)
                sess = Session.new(
                    agent=main_agent, store=_store, config=_config,
                    source="manual", sticky=True,
                )
                _config.set("main_session_id", sess.id)
                logger.info("Auto-created main session  agent=%s id=%s", main_agent_id, sess.id)
            except Exception as e:
                logger.warning("Failed to auto-create main session: %s", e)

    # 8. Start external chat manager (Telegram, etc.)
    from .messaging.manager import ExternalChatManager, set_external_chat_manager
    from .messaging.telegram import TelegramProvider
    _messaging = ExternalChatManager(config=_config, store=_store)
    tg = TelegramProvider(config=_config)
    if tg.configured:
        _messaging.register(tg)
    await _messaging.start_all()
    set_external_chat_manager(_messaging)
    app.state.messaging = _messaging

    logger.info("Started  host=localhost port=8000 log=%s", log_file.name)
    logger.info("Agents loaded  count=%d", len(list(_config.agents_dir.glob("*.md") if _config.agents_dir.exists() else [])))
    logger.info("Tasks registered  count=%d", len(_tasks))

    # Store refs in app state
    app.state.config = _config
    app.state.store = _store
    app.state.queue = _queue
    app.state.tasks = _tasks
    app.state.scheduler = _scheduler

    yield

    # Shutdown
    logger.info("Shutting down...")
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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
    from .api.routes.sessions import router as sessions_router
    from .api.routes.memory import router as memory_router
    from .api.routes.knowledge import router as knowledge_router
    from .api.routes.tasks import router as tasks_router
    from .api.routes.skills import router as skills_router
    from .api.routes.triggers import router as triggers_router
    from .api.routes.setup import router as setup_router
    from .api.routes.files import router as files_router
    from .api.routes.settings import router as settings_router
    from .api.websocket.handlers import router as ws_router

    app.include_router(agents_router, prefix="/api")
    app.include_router(sessions_router, prefix="/api")
    app.include_router(memory_router, prefix="/api")
    app.include_router(knowledge_router, prefix="/api")
    app.include_router(tasks_router, prefix="/api")
    app.include_router(skills_router, prefix="/api")
    app.include_router(triggers_router, prefix="/api")
    app.include_router(files_router, prefix="/api")
    app.include_router(settings_router, prefix="/api")
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
