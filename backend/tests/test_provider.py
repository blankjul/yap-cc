"""Tests for MockProvider."""

import pytest
from src.core.provider import MockProvider
from src.core.events import TextChunkEvent, DoneEvent


@pytest.mark.asyncio
async def test_mock_provider_yields_chunks_and_done():
    provider = MockProvider(responses=["Hello", " world"])
    events = []
    async for event in await provider.run("sys", [], "hi"):
        events.append(event)
    
    assert len(events) == 3
    assert isinstance(events[0], TextChunkEvent)
    assert events[0].content == "Hello"
    assert isinstance(events[1], TextChunkEvent)
    assert events[1].content == " world"
    assert isinstance(events[2], DoneEvent)


@pytest.mark.asyncio
async def test_mock_provider_empty_responses():
    provider = MockProvider(responses=[])
    events = []
    async for event in await provider.run("sys", [], "hi"):
        events.append(event)
    
    assert len(events) == 1
    assert isinstance(events[0], DoneEvent)
