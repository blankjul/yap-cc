"""
Bash shell execution tool for Yapflows v2 (openrouter provider).

Decorated with @tool from strands-agents for automatic schema generation
and tool dispatch.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess

log = logging.getLogger("yapflows.tool")

try:
    from strands import tool

    @tool
    def bash_tool(command: str) -> str:
        """
        Execute a bash shell command and return its output.
        
        Use this to read/write files, run scripts, search content,
        manage memory/knowledge files, and invoke skill scripts.
        
        Args:
            command: The bash command to execute
            
        Returns:
            stdout + stderr output of the command
        """
        log.info("Tool called  tool=bash command=%s", command[:100])
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = result.stdout
            if result.stderr:
                output += "\n" + result.stderr
            log.info("Tool done  tool=bash exit=%d output_len=%d", result.returncode, len(output))
            return output.strip() or "(no output)"
        except subprocess.TimeoutExpired:
            log.warning("Tool timeout  tool=bash command=%s", command[:100])
            return "Error: command timed out after 30 seconds"
        except Exception as e:
            log.error("Tool error  tool=bash error=%s", e)
            return f"Error: {e}"

except ImportError:
    # strands not installed — create a dummy for import purposes
    def bash_tool(command: str) -> str:  # type: ignore[misc]
        """Bash tool (strands not available)."""
        return "Error: strands-agents not installed"
