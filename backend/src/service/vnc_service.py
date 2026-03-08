"""
VNC service manager for yapflows.

Manages three processes: Xvfb (virtual display), x11vnc (VNC server), and websockify (WebSocket proxy).
Singleton service - one global instance shared across all browser sessions.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import subprocess
from typing import Optional

log = logging.getLogger("yapflows.vnc")


class VncService:
    """Singleton VNC service managing Xvfb, x11vnc, and websockify processes."""

    _instance: Optional[VncService] = None
    _lock = asyncio.Lock()

    def __init__(self):
        self.display = os.getenv("DISPLAY_NUMBER", ":99")
        self.vnc_port = int(os.getenv("VNC_PORT", "5900"))
        self.websockify_port = int(os.getenv("WEBSOCKIFY_PORT", "6081"))
        self.width = int(os.getenv("BROWSER_WIDTH", "1280"))
        self.height = int(os.getenv("BROWSER_HEIGHT", "720"))

        self.xvfb_process: Optional[subprocess.Popen] = None
        self.x11vnc_process: Optional[subprocess.Popen] = None
        self.websockify_process: Optional[subprocess.Popen] = None

    @classmethod
    async def get_instance(cls) -> VncService:
        """Get or create the singleton VNC service instance."""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = VncService()
            return cls._instance

    def is_running(self) -> bool:
        """Check if VNC service is running."""
        return (
            self.xvfb_process is not None
            and self.x11vnc_process is not None
            and self.websockify_process is not None
            and self.xvfb_process.poll() is None
            and self.x11vnc_process.poll() is None
            and self.websockify_process.poll() is None
        )

    def get_vnc_url(self) -> Optional[str]:
        """Get the noVNC WebSocket URL if service is running."""
        if self.is_running():
            # Get the actual network IP, not loopback
            import socket
            try:
                # Connect to an external address to find our network IP
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(("8.8.8.8", 80))
                host = s.getsockname()[0]
                s.close()
            except Exception:
                # Fallback to localhost if we can't determine network IP
                host = "localhost"

            # Add autoconnect parameter, no scaling to avoid zoom issues
            return f"http://{host}:{self.websockify_port}/vnc.html?autoconnect=true&resize=remote"
        return None

    async def start(self) -> str:
        """
        Start VNC service (Xvfb, x11vnc, websockify).
        Returns the noVNC URL.
        Idempotent: does nothing if already running.
        """
        if self.is_running():
            log.info("VNC service already running")
            return self.get_vnc_url()

        log.info("Starting VNC service on display %s", self.display)

        try:
            # 1. Start Xvfb (virtual X11 display)
            log.debug("Starting Xvfb")
            self.xvfb_process = subprocess.Popen(
                [
                    "Xvfb",
                    self.display,
                    "-screen",
                    "0",
                    f"{self.width}x{self.height}x24",
                    "-ac",
                    "+extension",
                    "GLX",
                    "+render",
                    "-noreset",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            # Wait for X server to be ready
            await asyncio.sleep(1.0)

            if self.xvfb_process.poll() is not None:
                raise RuntimeError("Xvfb failed to start")

            # 2. Start x11vnc (VNC server)
            log.debug("Starting x11vnc on port %d", self.vnc_port)
            self.x11vnc_process = subprocess.Popen(
                [
                    "x11vnc",
                    "-display",
                    self.display,
                    "-rfbport",
                    str(self.vnc_port),
                    "-shared",
                    "-forever",
                    "-nopw",
                    "-quiet",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            # Wait for VNC server to be ready
            await asyncio.sleep(0.5)

            if self.x11vnc_process.poll() is not None:
                raise RuntimeError("x11vnc failed to start")

            # 3. Start websockify (WebSocket proxy for noVNC)
            log.debug("Starting websockify on port %d", self.websockify_port)
            novnc_path = os.getenv("NOVNC_PATH", "/opt/novnc")

            # Find websockify - try venv first, then system
            import sys
            websockify_cmd = "websockify"
            venv_websockify = os.path.join(sys.prefix, "bin", "websockify")
            if os.path.exists(venv_websockify):
                websockify_cmd = venv_websockify

            self.websockify_process = subprocess.Popen(
                [
                    websockify_cmd,
                    "--web",
                    novnc_path,
                    "0.0.0.0:" + str(self.websockify_port),
                    f"localhost:{self.vnc_port}",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            # Wait for websockify to be ready
            await asyncio.sleep(0.5)

            if self.websockify_process.poll() is not None:
                raise RuntimeError("websockify failed to start")

            vnc_url = self.get_vnc_url()
            log.info("VNC service started successfully at %s", vnc_url)
            return vnc_url

        except Exception as e:
            log.error("Failed to start VNC service: %s", e)
            await self.stop()
            raise

    async def stop(self) -> None:
        """Stop VNC service (all processes)."""
        log.info("Stopping VNC service")

        processes = [
            ("websockify", self.websockify_process),
            ("x11vnc", self.x11vnc_process),
            ("Xvfb", self.xvfb_process),
        ]

        for name, proc in processes:
            if proc is not None:
                try:
                    log.debug("Stopping %s (pid=%d)", name, proc.pid)
                    proc.terminate()
                    try:
                        proc.wait(timeout=2.0)
                    except subprocess.TimeoutExpired:
                        log.warning("%s did not terminate, killing", name)
                        proc.kill()
                        proc.wait()
                except Exception as e:
                    log.error("Error stopping %s: %s", name, e)

        self.xvfb_process = None
        self.x11vnc_process = None
        self.websockify_process = None

        log.info("VNC service stopped")
