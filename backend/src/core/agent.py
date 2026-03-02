"""
Agent domain class.

Loads AgentConfig from disk (user agents override built-ins),
builds the system prompt, and lists available agents.

Search order: ~/.yapflows/agents/{name}.md → backend/agents/{name}.md
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

import frontmatter

if TYPE_CHECKING:
    from ..config import Config
    from .models import AgentConfig

log = logging.getLogger("yapflows.agent")

# Built-in agents bundled with the backend
_BUILTIN_AGENTS_DIR = Path(__file__).parent.parent.parent / "agents"


def _parse_agent_file(path: Path, builtin: bool = False) -> "AgentConfig":
    """Parse a .md agent file with YAML front matter → AgentConfig."""
    from .models import AgentConfig

    post = frontmatter.load(str(path))
    metadata = dict(post.metadata)
    body = post.content.strip()

    agent_id = path.stem
    return AgentConfig(
        id=agent_id,
        name=metadata.get("name", agent_id),
        provider_id=metadata.get("provider", "claude-cli"),
        model=metadata.get("model", "claude-opus-4-5"),
        color=metadata.get("color", "#6366f1"),
        avatar_url=metadata.get("avatar_url"),
        system_prompt=body,
        builtin=builtin,
    )


_SEP = "=" * 40


def _section(title: str) -> str:
    return f"{_SEP} {title} {_SEP}"


def _build_skills_section(cfg: "Config") -> str:
    from .skill import Skill
    try:
        skills = Skill.list(cfg)
    except Exception:
        skills = []

    lines = [_section("SKILLS")]
    if not skills:
        lines.append("\nNo skills available.")
        return "\n".join(lines)

    lines += [
        "",
        "Before doing manual research or computation, check if a relevant skill exists.",
        "To use a skill: read its SKILL.md file via bash, then follow the instructions exactly.",
    ]
    for skill in skills:
        lines.append(f"\n## {skill.id}")
        lines.append(skill.config.description)
        lines.append(f"Instructions file: {skill.config.path}/SKILL.md")
    return "\n".join(lines)


def _build_tasks_section(cfg: "Config") -> str:
    from .task import Task
    try:
        tasks = Task.list(cfg)
    except Exception:
        tasks = []

    lines = [_section("TASKS")]
    if not tasks:
        lines.append("\nNo tasks configured.")
        return "\n".join(lines)

    for task in tasks:
        c = task.config
        status = "enabled" if c.enabled else "disabled"
        lines.append(f"\n## {c.name}")
        lines.append(f"cron: {c.cron}  |  agent: {c.agent_id}  |  {status}")
        lines.append(f"Definition file: {cfg.tasks_dir}/{c.name}.json")
    return "\n".join(lines)


def _build_memory_section(memory_dir: Path) -> str:
    lines = [_section("MEMORY")]

    default_md = memory_dir / "default.md"
    lines.append(f"\n-- file: default.md ({default_md}) --")
    if default_md.exists():
        content = default_md.read_text().strip()
        lines.append("")
        lines.append(content if content else "(empty)")
    else:
        lines.append("(file does not exist yet)")

    other_files = sorted(p for p in memory_dir.glob("*.md") if p.name != "default.md")
    if other_files:
        lines.append("\n-- topic files: load via bash when relevant to the conversation --")
        for f in other_files:
            lines.append(f"- {f.name}  →  {f}")

    return "\n".join(lines)


def _build_interaction_section() -> str:
    lines = [_section("INTERACTION")]
    lines.append(
        """
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
inputs are genuinely needed at once."""
    )
    return "\n".join(lines)


def _build_knowledge_section(knowledge_dir: Path) -> str:
    lines = [_section("KNOWLEDGE")]

    if not knowledge_dir.exists():
        lines.append("\nNo knowledge files yet.")
        return "\n".join(lines)

    files = sorted(p for p in knowledge_dir.iterdir() if p.is_file())

    if not files:
        lines.append("\nNo knowledge files yet.")
    else:
        lines.append("\nLoad via bash when relevant:")
        for f in files:
            lines.append(f"- {f.name}  →  {f}")

    return "\n".join(lines)


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
        """Resolve user agent → built-in agent. Raises KeyError if not found."""
        user_path = config.agents_dir / f"{name}.md"
        if user_path.exists():
            agent_config = _parse_agent_file(user_path, builtin=False)
            log.debug("Loaded user agent: %s", name)
            return cls(config=agent_config, cfg=config)

        builtin_path = _BUILTIN_AGENTS_DIR / f"{name}.md"
        if builtin_path.exists():
            agent_config = _parse_agent_file(builtin_path, builtin=True)
            log.debug("Loaded builtin agent: %s", name)
            return cls(config=agent_config, cfg=config)

        raise KeyError(f"Agent not found: {name}")

    @classmethod
    def list(cls, config: "Config") -> "list[Agent]":
        """All discoverable agents. User agents override built-ins with same id."""
        seen: dict[str, "Agent"] = {}

        if _BUILTIN_AGENTS_DIR.exists():
            for path in sorted(_BUILTIN_AGENTS_DIR.glob("*.md")):
                try:
                    agent_config = _parse_agent_file(path, builtin=True)
                    seen[agent_config.id] = cls(config=agent_config, cfg=config)
                except Exception as e:
                    log.warning("Failed to load builtin agent %s: %s", path.name, e)

        if config.agents_dir.exists():
            for path in sorted(config.agents_dir.glob("*.md")):
                try:
                    agent_config = _parse_agent_file(path, builtin=False)
                    seen[agent_config.id] = cls(config=agent_config, cfg=config)
                except Exception as e:
                    log.warning("Failed to load user agent %s: %s", path.name, e)

        return list(seen.values())

    # ── Behaviour ─────────────────────────────────────────────────────────────

    def build_system_prompt(self) -> str:
        """Assemble structured system prompt with Agent, Skills, Memory, and Knowledge sections."""
        from datetime import date

        parts = [
            _section("AGENT") + "\n\n" + self.config.system_prompt.strip(),
            _build_interaction_section(),
            _build_skills_section(self._cfg),
            _build_tasks_section(self._cfg),
            _build_memory_section(self._memory_dir),
            _build_knowledge_section(self._knowledge_dir),
        ]
        prompt = "\n\n---\n\n".join(parts)
        prompt = f"Today: {date.today().isoformat()}\n\n{prompt}"
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
        return f"Agent(id={self.id!r}, provider={self.config.provider_id!r})"
