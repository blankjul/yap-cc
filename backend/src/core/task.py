"""
Task domain class.

Tasks are scheduled prompts. Each execution creates a TaskRun.
session_mode controls how sessions are managed per run:
  new   — fresh session per run (default)
  fixed — reuse one persistent session by alias (auto-derived from task name)

If target_session_alias is set, proactive behavior is enabled:
  - A sticky target session is created (or looked up) by that alias before the run
  - {{target_session_alias}} in prompt is interpolated with the alias value
  - After the run, a heartbeat_fired WS event is broadcast
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
                log.debug("Failed to parse run file %s", path.name, exc_info=True)
        return sorted(runs, key=lambda r: r.scheduled_at, reverse=True)

    async def execute(self, run: "TaskRun", store: "SessionStore", config: "Config") -> None:
        """Execute the task. Uses Session.send() for all session modes."""
        from .agent import Agent
        from .environment import Environment
        from .models import SessionState
        from .session import Session

        run.status = "running"
        run.started_at = datetime.utcnow()
        self._save_run(run)

        try:
            agent = Agent.load(self.config.agent_id, config)
            env = Environment.resolve(self.config.environment_id, config)
            provider_id = env.config.provider_id
            model = env.config.model
            environment_id = env.config.id

            mode = self.config.session_mode

            # If target_session_alias is set: ensure target session exists before run
            if self.config.target_session_alias:
                target_alias = self.config.target_session_alias
                target_state = store.get_by_alias(target_alias)
                if target_state is None:
                    now = datetime.utcnow()
                    target_state = SessionState(
                        id=uuid.uuid4().hex[:12],
                        title=target_alias,
                        agent_id=self.config.agent_id,
                        provider_id=provider_id,  # type: ignore[arg-type]
                        model=model,
                        environment_id=environment_id,
                        source="proactive",
                        sticky=True,
                        created_at=now,
                        updated_at=now,
                    )
                    store.save(target_state)
                    store.set_alias(target_state.id, target_alias)
                    log.info("Created target session  id=%s alias=%s", target_state.id, target_alias)

            # Interpolate {{target_session_alias}} in prompt
            prompt = self.config.prompt
            if self.config.target_session_alias:
                prompt = prompt.replace("{{target_session_alias}}", self.config.target_session_alias)

            # Resolve or create the execution session
            if mode == "fixed":
                alias = self.config.session_alias or self.config.name
                aliased_state = store.get_by_alias(alias)
                if aliased_state:
                    session = Session.load(aliased_state.id, store, config)
                else:
                    session = Session.new(
                        agent=agent, store=store, config=config,
                        source="scheduled", task_name=self.config.name, sticky=True,
                        provider_id=provider_id, model=model, environment_id=environment_id,
                    )
                    store.set_alias(session.id, alias)
            else:
                # new (default)
                session = Session.new(
                    agent=agent, store=store, config=config, source="scheduled",
                    provider_id=provider_id, model=model, environment_id=environment_id,
                    task_name=self.config.name,
                )

            run.session_id = session.id
            self._save_run(run)

            async for _ in await session.send(prompt):
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

            # Mark session unread if no active WS connection
            try:
                from ..api.websocket.manager import get_connection_manager
                ws_manager = get_connection_manager()
                if not ws_manager.has_connection(session.id):
                    fresh_state = store.load(session.id)
                    fresh_state.unread = True
                    store.save(fresh_state)
            except Exception:
                log.warning("Failed to mark task session unread", exc_info=True)

            # Broadcast heartbeat_fired if target_session_alias is set
            if self.config.target_session_alias:
                try:
                    from ..api.websocket.manager import get_connection_manager
                    ws_manager = get_connection_manager()
                    await ws_manager.broadcast({
                        "type": "heartbeat_fired",
                        "session_id": session.id,
                    })
                except Exception:
                    log.warning("Failed to broadcast heartbeat_fired WS event", exc_info=True)

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
