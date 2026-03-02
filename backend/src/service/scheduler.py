"""
APScheduler setup for Yapflows v2.

Loads TaskConfig objects from ~/.yapflows/tasks/ and registers cron jobs.
Each job pushes a TaskRun onto the TaskQueue.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..config import Config
    from .queue import TaskQueue

log = logging.getLogger("yapflows.scheduler")


def setup_scheduler(config: "Config", queue: "TaskQueue") -> Any | None:
    """
    Create and configure an APScheduler AsyncIOScheduler.
    Returns the scheduler (not yet started), or None if apscheduler not installed.
    """
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:
        log.warning("apscheduler not installed — scheduling disabled")
        return None

    from ..core.task import Task

    scheduler = AsyncIOScheduler()

    tasks = Task.list(config)
    registered = 0

    for task in tasks:
        if not task.config.enabled:
            continue
        cron_expr = task.config.cron.strip()
        if not cron_expr:
            continue
        parts = cron_expr.split()
        if len(parts) != 5:
            log.warning("Task '%s' has invalid cron '%s' — skipping", task.name, cron_expr)
            continue
        try:
            trigger = CronTrigger(
                minute=parts[0], hour=parts[1], day=parts[2],
                month=parts[3], day_of_week=parts[4],
            )
            scheduler.add_job(
                _fire_task,
                trigger=trigger,
                args=[task.name, config, queue],
                id=task.name,
                name=task.name,
                replace_existing=True,
            )
            registered += 1
            log.info("Registered task '%s' cron='%s'", task.name, cron_expr)
        except Exception as e:
            log.error("Failed to register task '%s': %s", task.name, e)

    log.info("Tasks registered  count=%d", registered)
    return scheduler


async def _fire_task(task_name: str, config: "Config", queue: "TaskQueue") -> None:
    """Called by APScheduler on cron fire."""
    from datetime import datetime
    from ..core.task import Task

    log.info("Task fired  task=%s", task_name)
    try:
        task = Task.load(task_name, config)
        task.enqueue(queue._queue)
        log.info("Task enqueued  task=%s", task_name)
    except Exception as e:
        log.error("Failed to fire task '%s': %s", task_name, e)


def start_scheduler(scheduler: Any) -> None:
    if scheduler is None:
        return
    try:
        scheduler.start()
        log.info("Scheduler started")
    except Exception as e:
        log.error("Failed to start scheduler: %s", e)


def stop_scheduler(scheduler: Any) -> None:
    if scheduler is None:
        return
    try:
        scheduler.shutdown(wait=False)
        log.info("Scheduler stopped")
    except Exception as e:
        log.error("Failed to stop scheduler: %s", e)


def reload_jobs(scheduler: Any, config: "Config", queue: "TaskQueue") -> None:
    """Reload all cron jobs (called after task create/update/delete)."""
    if scheduler is None:
        return
    try:
        from apscheduler.triggers.cron import CronTrigger
        from ..core.task import Task

        scheduler.remove_all_jobs()
        tasks = Task.list(config)
        for task in tasks:
            if not task.config.enabled:
                continue
            cron_expr = task.config.cron.strip()
            if not cron_expr:
                continue
            parts = cron_expr.split()
            if len(parts) != 5:
                continue
            try:
                trigger = CronTrigger(
                    minute=parts[0], hour=parts[1], day=parts[2],
                    month=parts[3], day_of_week=parts[4],
                )
                scheduler.add_job(
                    _fire_task,
                    trigger=trigger,
                    args=[task.name, config, queue],
                    id=task.name,
                    name=task.name,
                    replace_existing=True,
                )
            except Exception as e:
                log.error("Failed to re-register task '%s': %s", task.name, e)
        log.info("Jobs reloaded")
    except Exception as e:
        log.error("Failed to reload jobs: %s", e)
