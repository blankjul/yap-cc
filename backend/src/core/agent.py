"""
Agent domain class.

Loads AgentConfig from disk (~/.yapflows/agents/),
builds the system prompt, and lists available agents.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

import frontmatter
from jinja2 import Environment, FileSystemLoader

if TYPE_CHECKING:
    from ..config import Config
    from .models import AgentConfig

log = logging.getLogger("yapflows.agent")

_TEMPLATE_DIR = Path(__file__).parent
_JINJA_ENV = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=False,
    trim_blocks=True,
    lstrip_blocks=True,
)

WEB_CHAT_INSTRUCTIONS = """\
When you need input from the user before continuing, embed an interaction block
in your response and stop generating after the closing tag.
The user's answer(s) will arrive as your next message.

--- Single question ---

  <ask>Your question here</ask>
  <ask type="confirmation">Proceed?</ask>
  <ask type="single_choice" options="Option A|Option B|Option C">Which do you prefer?</ask>
  <ask type="multi_choice" options="Tag1|Tag2|Tag3">Select all that apply</ask>

Rules: put on its own line, stop after </ask>, one question per turn.

--- Multiple questions (shown as a form, submitted together) ---

  All questions on one page (default):
  <ask-form>
    <ask name="project_name">What should the project be called?</ask>
    <ask name="language" type="single_choice" options="Python|TypeScript|Rust">Which language?</ask>
    <ask name="tests" type="confirmation">Include tests?</ask>
  </ask-form>

  One question at a time, auto-advance on selection (good for longer questionnaires):
  <ask-form paginated="true">
    <ask name="mood" type="single_choice" options="Happy|Neutral|Stressed">How are you feeling?</ask>
    <ask name="goal">What's your main goal today?</ask>
  </ask-form>

The `name` attribute becomes the key in the JSON answer you receive, e.g.:
  {"project_name": "myapp", "language": "TypeScript", "tests": "Yes"}

Rules: stop after </ask-form>, use <ask-form> only when multiple related
inputs are genuinely needed at once.\
"""


def _parse_agent_file(path: Path) -> "AgentConfig":
    """Parse a .md agent file with YAML front matter → AgentConfig."""
    from .models import AgentConfig

    post = frontmatter.load(str(path))
    metadata = dict(post.metadata)
    body = post.content.strip()

    agent_id = path.stem
    return AgentConfig(
        id=agent_id,
        name=metadata.get("name", agent_id),
        color=metadata.get("color", "#6366f1"),
        avatar_url=metadata.get("avatar_url"),
        system_prompt=body,
    )


_SEP = "=" * 40


class Agent:
    """Domain class wrapping AgentConfig with system prompt assembly."""

    def __init__(self, config: "AgentConfig", cfg: "Config") -> None:
        self.config = config
        self._cfg = cfg
        self._memory_dir = cfg.memory_dir
        self._knowledge_dir = cfg.knowledge_dir

    # ── Factories ──────────────────────────────────────────────────────────────

    @classmethod
    def load(cls, name: str, config: "Config") -> "Agent":
        """Load agent from user dir. Raises KeyError if not found."""
        user_path = config.agents_dir / f"{name}.md"
        if user_path.exists():
            agent_config = _parse_agent_file(user_path)
            log.debug("Loaded agent: %s", name)
            return cls(config=agent_config, cfg=config)

        raise KeyError(f"Agent not found: {name}")

    @classmethod
    def list(cls, config: "Config") -> "list[Agent]":
        """All agents in the user agents directory."""
        agents: list["Agent"] = []

        if config.agents_dir.exists():
            for path in sorted(config.agents_dir.glob("*.md")):
                try:
                    agent_config = _parse_agent_file(path)
                    agents.append(cls(config=agent_config, cfg=config))
                except Exception as e:
                    log.warning("Failed to load agent %s: %s", path.name, e)

        return agents

    # ── Behaviour ─────────────────────────────────────────────────────────────

    def build_system_prompt(self, chat_instructions: str = "") -> str:
        """Assemble structured system prompt via Jinja2 template."""
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        from .skill import Skill
        from .task import Task
        from .tool import Tool, Toolkit

        skills = []
        try:
            for s in Skill.list(self._cfg):
                skills.append({"id": s.id, "description": s.config.description})
        except Exception:
            log.debug("Failed to load skills for system prompt", exc_info=True)

        tools = []
        try:
            for t in Tool.list(self._cfg):
                usage = t.config.usage.replace("{path}", str(t.config.path))
                tools.append({"name": t.config.name, "description": t.config.description, "usage": usage})
        except Exception:
            log.debug("Failed to load tools for system prompt", exc_info=True)

        toolkits = []
        try:
            for tk in Toolkit.list(self._cfg):
                toolkit_tools = []
                for t in tk.config.tools:
                    toolkit_tools.append({"name": t.name, "description": t.description, "usage": t.usage})
                toolkits.append({"id": tk.config.id, "description": tk.config.description, "tools": toolkit_tools})
        except Exception:
            log.debug("Failed to load toolkits for system prompt", exc_info=True)

        tasks = []
        try:
            for t in Task.list(self._cfg):
                c = t.config
                tasks.append({"name": c.name, "cron": c.cron, "agent_id": c.agent_id, "enabled": c.enabled})
        except Exception:
            log.debug("Failed to load tasks for system prompt", exc_info=True)

        memory_default_path = self._memory_dir / "default.md"
        if memory_default_path.exists():
            content = memory_default_path.read_text().strip()
            memory_default_content = content if content else "(empty)"
        else:
            memory_default_content = "(file does not exist yet)"

        from .shell_env import as_context as _shell_env_context, parameterize as _parameterize

        for tool in tools:
            tool["usage"] = _parameterize(tool["usage"])
        for toolkit in toolkits:
            for t in toolkit["tools"]:
                t["usage"] = _parameterize(t["usage"])

        memory_topics = [
            {"name": p.name, "path": _parameterize(str(p))}
            for p in sorted(self._memory_dir.glob("*.md"))
            if p.name != "default.md"
        ]

        knowledge_files = []
        if self._knowledge_dir.exists():
            knowledge_files = [
                {"name": p.name, "path": _parameterize(str(p))}
                for p in sorted(self._knowledge_dir.iterdir()) if p.is_file()
            ]

        now_utc = datetime.now(timezone.utc)

        timezones = {}
        for tz_name in ["America/New_York", "Europe/Berlin"]:
            try:
                timezones[tz_name] = now_utc.astimezone(ZoneInfo(tz_name))
            except Exception:
                pass

        ctx = {
            "today": now_utc.date().isoformat(),
            "now_utc": now_utc.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "day_of_week": now_utc.strftime("%A"),
            "iso_week": f"{now_utc.isocalendar()[0]}-W{now_utc.isocalendar()[1]:02d}",
            "timezones": timezones,
            "env_vars": _shell_env_context(),
            "sep": _SEP,
            "agent_prompt": self.config.system_prompt.strip(),
            "chat_instructions": chat_instructions if chat_instructions else WEB_CHAT_INSTRUCTIONS,
            "skills": skills,
            "tools": tools,
            "toolkits": toolkits,
            "tasks": tasks,
            "memory_default_content": memory_default_content,
            "memory_topics": memory_topics,
            "knowledge_files": knowledge_files,
        }

        template = _JINJA_ENV.get_template("system_prompt.md")
        prompt = template.render(**ctx)
        log.debug("System prompt assembled  agent=%s chars=%d", self.config.id, len(prompt))
        return prompt

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def id(self) -> str:
        return self.config.id

    @property
    def name(self) -> str:
        return self.config.name

    def __repr__(self) -> str:
        return f"Agent(id={self.id!r})"
