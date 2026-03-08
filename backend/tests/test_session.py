"""Tests for Session and SessionStore."""

import asyncio
import pytest
from pathlib import Path
from datetime import datetime

from src.core.models import AgentConfig, SessionState
from src.core.session import Session, MemorySessionStore, FileSessionStore
from src.core.provider import MockProvider


def make_agent(tmp_path, system_prompt="You are helpful."):
    from src.core.agent import Agent
    from src.core.models import AgentConfig
    config_obj = AgentConfig(
        id="test",
        name="Test",
        provider_id="claude-cli",
        model="mock",
        system_prompt=system_prompt,
    )
    return Agent(config=config_obj, memory_dir=tmp_path / "memory")


@pytest.fixture
def memory_store():
    return MemorySessionStore()


@pytest.mark.asyncio
async def test_session_new_and_send(tmp_path):
    """Session.new() + send() with MockProvider yields correct events."""
    agent = make_agent(tmp_path)
    store = MemorySessionStore()
    
    # Patch Session.new to use MockProvider instead of real provider
    from src.core.models import SessionState
    from src.core.session import _new_session_id
    now = datetime.utcnow()
    state = SessionState(
        id=_new_session_id(),
        title="New conversation",
        agent_id="test",
        provider_id="claude-cli",
        model="mock",
        created_at=now,
        updated_at=now,
    )
    store.save(state)
    provider = MockProvider(responses=["Hello", " world"])
    session = Session(state=state, agent=agent, provider=provider, store=store)

    events = []
    async for event in await session.send("Hi"):
        events.append(event)

    from src.core.events import TextChunkEvent, DoneEvent
    text_events = [e for e in events if isinstance(e, TextChunkEvent)]
    done_events = [e for e in events if isinstance(e, DoneEvent)]
    
    assert len(text_events) == 2
    assert text_events[0].content == "Hello"
    assert text_events[1].content == " world"
    assert len(done_events) == 1
    assert events[-1] == done_events[0]


@pytest.mark.asyncio
async def test_session_appends_messages(tmp_path):
    """After send(), session has user + assistant messages."""
    agent = make_agent(tmp_path)
    store = MemorySessionStore()
    
    from src.core.models import SessionState
    from src.core.session import _new_session_id
    now = datetime.utcnow()
    state = SessionState(
        id=_new_session_id(),
        title="New conversation",
        agent_id="test",
        provider_id="claude-cli",
        model="mock",
        created_at=now,
        updated_at=now,
    )
    store.save(state)
    provider = MockProvider(responses=["Response text"])
    session = Session(state=state, agent=agent, provider=provider, store=store)

    async for _ in await session.send("User message"):
        pass

    assert len(session.messages) == 2
    assert session.messages[0].role == "user"
    assert session.messages[0].content == "User message"
    assert session.messages[1].role == "assistant"
    assert session.messages[1].content == "Response text"


@pytest.mark.asyncio
async def test_session_auto_title(tmp_path):
    """First user message auto-sets the session title."""
    agent = make_agent(tmp_path)
    store = MemorySessionStore()

    from src.core.models import SessionState
    from src.core.session import _new_session_id
    now = datetime.utcnow()
    state = SessionState(
        id=_new_session_id(),
        title="New conversation",
        agent_id="test",
        provider_id="claude-cli",
        model="mock",
        created_at=now,
        updated_at=now,
    )
    store.save(state)
    provider = MockProvider(responses=["ok"])
    session = Session(state=state, agent=agent, provider=provider, store=store)

    async for _ in await session.send("What is the weather?"):
        pass

    assert session.state.title == "What is the weather?"


def test_memory_store_save_load():
    store = MemorySessionStore()
    now = datetime.utcnow()
    state = SessionState(
        id="s1",
        title="Test",
        agent_id="assistant",
        provider_id="claude-cli",
        model="claude-opus-4-5",
        created_at=now,
        updated_at=now,
    )
    store.save(state)
    loaded = store.load("s1")
    assert loaded.id == "s1"
    assert loaded.title == "Test"


def test_memory_store_not_found():
    store = MemorySessionStore()
    with pytest.raises(KeyError):
        store.load("nonexistent")


def test_memory_store_list():
    store = MemorySessionStore()
    now = datetime.utcnow()
    for i in range(3):
        state = SessionState(
            id=f"s{i}",
            title=f"Session {i}",
            agent_id="assistant",
            provider_id="claude-cli",
            model="claude-opus-4-5",
            created_at=now,
            updated_at=now,
        )
        store.save(state)
    assert len(store.list()) == 3


def test_memory_store_archive_restore():
    store = MemorySessionStore()
    now = datetime.utcnow()
    state = SessionState(
        id="s1",
        title="Test",
        agent_id="assistant",
        provider_id="claude-cli",
        model="claude-opus-4-5",
        created_at=now,
        updated_at=now,
    )
    store.save(state)
    store.archive("s1")
    assert store.load("s1").archived is True
    store.restore("s1")
    assert store.load("s1").archived is False


def test_file_store_roundtrip(tmp_path):
    store = FileSessionStore(chats_dir=tmp_path / "chats")
    now = datetime.utcnow()
    state = SessionState(
        id="s1",
        title="File Test",
        agent_id="assistant",
        provider_id="claude-cli",
        model="claude-opus-4-5",
        created_at=now,
        updated_at=now,
    )
    store.save(state)
    loaded = store.load("s1")
    assert loaded.id == "s1"
    assert loaded.title == "File Test"
    # Verify file exists
    assert (tmp_path / "chats" / "s1.json").exists()


def test_file_store_list(tmp_path):
    store = FileSessionStore(chats_dir=tmp_path / "chats")
    now = datetime.utcnow()
    for i in range(2):
        state = SessionState(
            id=f"s{i}",
            title=f"S{i}",
            agent_id="assistant",
            provider_id="claude-cli",
            model="claude-opus-4-5",
            created_at=now,
            updated_at=now,
        )
        store.save(state)
    assert len(store.list()) == 2
