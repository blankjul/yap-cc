"""
Logging configuration for Yapflows v2.

- New timestamped log file on every server start
- Keeps last N files (configurable)
- Human-readable fixed-width format
- Console output in dev mode (with colour)
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .config import Config


class YapflowsFormatter(logging.Formatter):
    """Fixed-width format: timestamp  LEVEL  [logger]  message"""

    FMT = "%(asctime)s  %(levelname)-6s [%(name)-16s] %(message)s"
    DATE_FMT = "%Y-%m-%d %H:%M:%S"

    def format(self, record: logging.LogRecord) -> str:
        # Strip 'yapflows.' prefix from logger name for brevity
        if record.name.startswith("yapflows."):
            record.name = record.name[len("yapflows."):]
        return super().format(record)


class ColorFormatter(YapflowsFormatter):
    COLORS = {
        "DEBUG": "\033[36m",
        "INFO": "\033[32m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
        "CRITICAL": "\033[35m",
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


def configure_logging(config: "Config") -> Path:
    """
    Set up logging for this server run.
    Creates a new timestamped log file. Cleans up old files.
    Returns the path of the new log file.
    """
    log_dir = config.log_dir
    log_dir.mkdir(parents=True, exist_ok=True)

    # Clean up old log files
    existing = sorted(log_dir.glob("*.log"))
    keep = config.log_keep
    for old in existing[: max(0, len(existing) - keep + 1)]:
        try:
            old.unlink()
        except OSError:
            pass

    # New file for this run
    filename = datetime.now().strftime("%Y-%m-%d_%H%M%S") + ".log"
    log_file = log_dir / filename

    level = getattr(logging, config.log_level, logging.INFO)

    # File handler — always active
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(YapflowsFormatter(
        fmt=YapflowsFormatter.FMT,
        datefmt=YapflowsFormatter.DATE_FMT,
    ))
    file_handler.setLevel(level)

    handlers: list[logging.Handler] = [file_handler]

    # Console handler — dev mode only
    if config.dev_mode:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(ColorFormatter(
            fmt=YapflowsFormatter.FMT,
            datefmt=YapflowsFormatter.DATE_FMT,
        ))
        console_handler.setLevel(level)
        handlers.append(console_handler)

    # Configure root logger for 'yapflows.*' namespace
    yapflows_logger = logging.getLogger("yapflows")
    yapflows_logger.setLevel(level)
    yapflows_logger.handlers.clear()
    for h in handlers:
        yapflows_logger.addHandler(h)
    yapflows_logger.propagate = False

    # Root logger — quieter
    root = logging.getLogger()
    root.setLevel(logging.WARNING)

    return log_file
