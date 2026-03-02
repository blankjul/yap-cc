"""
Task queue with single background worker for Yapflows v2.

One task runs at a time. APScheduler and the "Run now" API both
push TaskRun objects onto this queue.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..core.models import TaskRun
    from ..core.task import Task
    from ..core.session import SessionStore
    from ..config import Config

log = logging.getLogger("yapflows.queue")


class TaskQueue:
    """Single-worker task queue."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue["TaskRun"] = asyncio.Queue()
        self._running = False

    def enqueue(self, run: "TaskRun") -> None:
        """Push a TaskRun onto the queue."""
        self._queue.put_nowait(run)
        log.info("Enqueued  run=%s task=%s queue_depth=%d",
                 run.id, run.task_name, self._queue.qsize())

    async def worker(
        self,
        tasks: "dict[str, Task]",
        store: "SessionStore",
        config: "Config",
    ) -> None:
        """
        Runs forever. Call once at server startup as an asyncio background task.
        Processes one TaskRun at a time.
        """
        self._running = True
        log.info("Queue worker started")
        while self._running:
            try:
                run = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            task = tasks.get(run.task_name)
            if task is None:
                log.warning("Task not found for run %s: %s", run.id, run.task_name)
                run.status = "failed"
                run.error = f"Task '{run.task_name}' not found"
                run.completed_at = datetime.utcnow()
                (config.runs_dir / f"{run.id}.json").write_text(run.model_dump_json(indent=2))
                self._queue.task_done()
                continue

            log.info("Run started  run=%s task=%s", run.id, run.task_name)
            try:
                await task.execute(run, store, config)
            except Exception as e:
                log.error("Worker error  run=%s error=%s", run.id, e, exc_info=True)
            finally:
                self._queue.task_done()

    def stop(self) -> None:
        self._running = False
