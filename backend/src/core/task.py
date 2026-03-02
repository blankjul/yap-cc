"""
Task domain class.

Tasks are scheduled prompts. Each execution creates a TaskRun.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..config import Config
    from .models import TaskConfig, TaskRun
    from .session import SessionStore

log = logging.getLogger("yapflows.task")


def _runs_dir(config: "Config") -> Path:
    return config.runs_dir


class Task:
    """Domain class for a scheduled task."""

    def __init__(
        self,
        config: "TaskConfig",
        runs_dir: Path,
    ) -> None:
        self.config = config
        self._runs_dir = runs_dir
        self._runs_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def load(cls, name: str, config: "Config") -> "Task":
        import json
        from .models import TaskConfig

        path = config.tasks_dir / f"{name}.json"
        if not path.exists():
            raise KeyError(f"Task not found: {name}")
        task_config = TaskConfig.model_validate(json.loads(path.read_text()))
        return cls(config=task_config, runs_dir=config.runs_dir)

    @classmethod
    def list(cls, config: "Config") -> "list[Task]":
        import json
        from .models import TaskConfig

        tasks = []
        if config.tasks_dir.exists():
            for path in sorted(config.tasks_dir.glob("*.json")):
                try:
                    task_config = TaskConfig.model_validate(json.loads(path.read_text()))
                    tasks.append(cls(config=task_config, runs_dir=config.runs_dir))
                except Exception as e:
                    log.warning("Failed to load task %s: %s", path.name, e)
        return tasks

    def save(self, tasks_dir: Path) -> None:
        """Persist task config to disk."""
        tasks_dir.mkdir(parents=True, exist_ok=True)
        path = tasks_dir / f"{self.config.name}.json"
        path.write_text(self.config.model_dump_json(indent=2))

    def enqueue(self, queue: "asyncio.Queue", scheduled_at: datetime | None = None) -> "TaskRun":
        """Create a TaskRun, persist it, and push onto the queue."""
        import asyncio
        from .models import TaskRun

        run = TaskRun(
            id=f"run-{uuid.uuid4().hex[:12]}",
            task_name=self.config.name,
            status="pending",
            scheduled_at=scheduled_at or datetime.utcnow(),
        )
        self._save_run(run)
        queue.put_nowait(run)
        log.info("Enqueued  run=%s task=%s", run.id, self.config.name)
        return run

    def _save_run(self, run: "TaskRun") -> None:
        path = self._runs_dir / f"{run.id}.json"
        path.write_text(run.model_dump_json(indent=2))

    def list_runs(self) -> "list[TaskRun]":
        from .models import TaskRun

        runs = []
        for path in self._runs_dir.glob("*.json"):
            try:
                run = TaskRun.model_validate_json(path.read_text())
                if run.task_name == self.config.name:
                    runs.append(run)
            except Exception:
                pass
        return sorted(runs, key=lambda r: r.scheduled_at, reverse=True)

    async def execute(self, run: "TaskRun", store: "SessionStore", config: "Config") -> None:
        """Execute the task: create/reuse session, send prompt, update run status."""
        from .agent import Agent
        from .session import Session
        from .models import TaskRun

        run.status = "running"
        run.started_at = datetime.utcnow()
        self._save_run(run)

        try:
            agent = Agent.load(self.config.agent_id, config)

            # Find or create session
            if self.config.use_main_session:
                # Post into the global main session
                main_state = store.get_main(config.main_session_id if config else None)
                if main_state:
                    session = Session.load(main_state.id, store, config)
                else:
                    # Auto-create main session using main_agent_id from config (or task agent)
                    main_agent_id = config.main_agent_id if config else None
                    if main_agent_id:
                        try:
                            main_agent = Agent.load(main_agent_id, config)
                        except KeyError:
                            main_agent = agent
                    else:
                        main_agent = agent
                    session = Session.new(
                        agent=main_agent, store=store, config=config,
                        source="manual", task_name=None, sticky=True,
                    )
                    if config:
                        config.set("main_session_id", session.id)
            elif self.config.sticky_session:
                # Try to find an existing sticky session for this task
                existing = [
                    s for s in store.list()
                    if s.task_name == self.config.name and s.sticky and not s.archived
                ]
                if existing:
                    session = Session.load(existing[0].id, store, config)
                else:
                    session = Session.new(
                        agent=agent, store=store, config=config, source="scheduled",
                        model=self.config.model, task_name=self.config.name, sticky=True,
                    )
            else:
                session = Session.new(
                    agent=agent, store=store, config=config, source="scheduled",
                    model=self.config.model, task_name=self.config.name,
                )

            run.session_id = session.id
            self._save_run(run)

            # Execute
            async for _ in await session.send(self.config.prompt):
                pass  # consume all events

            # Forward response to external chat if applicable
            try:
                from ..messaging.manager import get_external_chat_manager
                messaging = get_external_chat_manager()
                if messaging:
                    fresh_state = store.load(session.id)
                    await messaging.forward_last_response(fresh_state)
            except Exception:
                log.warning("Failed to forward task response to external chat", exc_info=True)

            run.status = "done"
            run.completed_at = datetime.utcnow()
            self._save_run(run)
            log.info("Run done  run=%s session=%s", run.id, session.id)

        except Exception as e:
            run.status = "failed"
            run.error = str(e)
            run.completed_at = datetime.utcnow()
            self._save_run(run)
            log.error("Run failed  run=%s error=%s", run.id, e, exc_info=True)

    @property
    def name(self) -> str:
        return self.config.name
