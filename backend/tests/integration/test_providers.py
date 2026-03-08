"""Integration tests for provider loading and mocking."""

import pytest


@pytest.mark.integration
def test_mock_provider_works():
    """Test that MockProvider works without any API keys."""
    from src.core.provider import MockProvider
    from src.core.events import TextChunkEvent, DoneEvent

    provider = MockProvider(responses=["Test", " response"])

    # Should work without any credentials
    assert provider is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mock_provider_streaming():
    """Test that MockProvider streams responses correctly."""
    from src.core.provider import MockProvider
    from src.core.events import TextChunkEvent, DoneEvent

    provider = MockProvider(responses=["Hello", " from", " mock"])

    events = []
    async for event in await provider.run("system", [], "test"):
        events.append(event)

    # Should have 3 text chunks + 1 done event
    assert len(events) == 4

    # Verify chunk content
    assert isinstance(events[0], TextChunkEvent)
    assert events[0].content == "Hello"
    assert isinstance(events[1], TextChunkEvent)
    assert events[1].content == " from"
    assert isinstance(events[2], TextChunkEvent)
    assert events[2].content == " mock"

    # Last event should be Done
    assert isinstance(events[3], DoneEvent)


@pytest.mark.integration
def test_provider_loading_without_credentials(test_env):
    """Test that provider loading handles missing credentials gracefully."""
    from src.config import Config

    # Config should load without OpenRouter key
    config = Config()

    # Should not crash when loading settings without API keys
    assert config._settings is not None
    assert config.base_dir.exists()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_agent_with_mock_provider(test_env):
    """Test that agents can use MockProvider for testing."""
    from src.config import Config
    from src.core.agent import Agent
    from src.core.provider import MockProvider

    config = Config()

    # Create a test agent definition
    agents_dir = config.agents_dir
    test_agent = agents_dir / "test-agent.md"
    test_agent.write_text(
        """---
name: test-agent
version: 1
model: mock/test
system: You are a test agent.
---

Test agent for integration testing.
"""
    )

    # Load the agent
    agents = Agent.list(config)
    agent_names = [a.name for a in agents]
    assert "test-agent" in agent_names


@pytest.mark.integration
def test_openrouter_provider_graceful_without_key(test_env, monkeypatch):
    """
    Test that code doesn't crash when OpenRouter key is missing.

    This tests graceful degradation - we should be able to start the server
    even without API keys configured.
    """
    from src.config import Config

    # Ensure no API key is set
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    # Config should still load
    config = Config()
    assert config is not None

    # Settings should load (might have empty/null API key)
    assert config._settings is not None
    assert config.base_dir.exists()


@pytest.mark.external
@pytest.mark.asyncio
async def test_real_openrouter_api(monkeypatch):
    """
    Test real OpenRouter API call.

    This test is marked as 'external' and requires OPENROUTER_API_KEY.
    It costs tokens and is skipped by default.

    Run with: pytest -m external
    """
    import os

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        pytest.skip("OPENROUTER_API_KEY not set")

    # Import OpenRouter provider
    from src.core.provider import OpenRouterProvider

    # Create provider
    provider = OpenRouterProvider(api_key=api_key, base_url=None)

    # Make a simple request
    events = []
    async for event in await provider.run(
        system="You are helpful.",
        messages=[],
        user_message="Say 'test' and nothing else.",
    ):
        events.append(event)

    # Should get at least one event
    assert len(events) > 0


@pytest.mark.integration
def test_litellm_import_works():
    """Test that litellm can be imported (used by providers)."""
    try:
        import litellm

        assert litellm is not None
    except ImportError:
        pytest.fail("litellm should be importable")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_provider_registry(test_env):
    """Test that provider registry works with mock providers."""
    from src.core.provider import MockProvider

    # Create multiple mock providers
    provider1 = MockProvider(responses=["Response 1"])
    provider2 = MockProvider(responses=["Response 2"])

    assert provider1 is not None
    assert provider2 is not None

    # They should be independent
    events1 = []
    async for event in await provider1.run("sys", [], "test"):
        events1.append(event)

    events2 = []
    async for event in await provider2.run("sys", [], "test"):
        events2.append(event)

    # Should have different responses
    assert len(events1) > 0
    assert len(events2) > 0
