"""Tests for core data models."""

from datetime import datetime
import pytest
from src.core.models import (
    AgentConfig, Message, SessionState, ToolCall,
    ToolCallView, MessageView, SessionView,
    TaskConfig, TaskRun, TriggerConfig, SkillConfig,
    SetupStatus, ProviderTestResult,
)


def make_agent_config(**kwargs) -> AgentConfig:
    defaults = dict(
        id="assistant",
        name="Assistant",
        provider_id="claude-cli",
        model="claude-opus-4-5",
        system_prompt="You are helpful.",
    )
    defaults.update(kwargs)
    return AgentConfig(**defaults)


def make_session_state(**kwargs) -> SessionState:
    now = datetime.utcnow()
    defaults = dict(
        id="sess-test",
        title="Test session",
        agent_id="assistant",
        provider_id="claude-cli",
        model="claude-opus-4-5",
        created_at=now,
        updated_at=now,
    )
    defaults.update(kwargs)
    return SessionState(**defaults)


def test_agent_config_defaults():
    config = make_agent_config()
    assert config.id == "assistant"
    assert config.color == "#6366f1"
    assert config.avatar_url is None
    assert config.builtin is False


def test_session_state_defaults():
    state = make_session_state()
    assert state.messages == []
    assert state.sticky is False
    assert state.archived is False
    assert state.source == "manual"
    assert state.cli_session_id is None


def test_session_view_from_state_empty():
    agent_config = make_agent_config()
    state = make_session_state()
    view = SessionView.from_state(state, agent_config)
    assert view.id == state.id
    assert view.title == state.title
    assert view.messages == []
    assert view.agent.id == agent_config.id


def test_session_view_from_state_with_messages():
    now = datetime.utcnow()
    agent_config = make_agent_config()
    state = make_session_state()
    state.messages = [
        Message(role="user", content="Hello", timestamp=now),
        Message(role="assistant", content="Hi there!", timestamp=now),
    ]
    view = SessionView.from_state(state, agent_config)
    assert len(view.messages) == 2
    assert view.messages[0].role == "user"
    assert view.messages[1].content == "Hi there!"


def test_session_view_tool_call_formatting():
    now = datetime.utcnow()
    agent_config = make_agent_config()
    state = make_session_state()
    tc = ToolCall(
        id="tc-1",
        tool="bash",
        input={"command": "ls ~/.yapflows/"},
        output="memory/\nchats/\n",
        started_at=now,
        completed_at=now,
    )
    state.messages = [
        Message(role="user", content="List files", timestamp=now),
        Message(role="assistant", content="Here they are:", tool_calls=[tc], timestamp=now),
    ]
    view = SessionView.from_state(state, agent_config)
    msg_view = view.messages[1]
    assert len(msg_view.tool_calls) == 1
    tc_view = msg_view.tool_calls[0]
    assert tc_view.tool == "bash"
    assert tc_view.status == "done"
    assert "command" in tc_view.input_summary


def test_task_config():
    task = TaskConfig(
        name="standup",
        cron="0 9 * * 1-5",
        agent_id="assistant",
        prompt="Generate standup",
    )
    assert task.enabled is True
    assert task.sticky_session is False
    assert task.model is None


def test_setup_status():
    s = SetupStatus(required=True)
    assert s.required is True


def test_provider_test_result():
    r = ProviderTestResult(ok=True)
    assert r.error is None
    r2 = ProviderTestResult(ok=False, error="connection refused")
    assert r2.error == "connection refused"


def test_session_state_roundtrip_json():
    state = make_session_state()
    json_str = state.model_dump_json()
    state2 = SessionState.model_validate_json(json_str)
    assert state2.id == state.id
    assert state2.title == state.title
