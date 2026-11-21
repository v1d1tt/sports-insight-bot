"""Seam 1: POST /api/chat through FastAPI's test client, with a fake model provider."""

import json
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app, get_model_provider
from app.model_provider import ProviderError
from tests.fake_provider import FakeProvider

client = TestClient(app)

Chat = Callable[[FakeProvider, list[dict]], Response]


@pytest.fixture
def chat() -> Iterator[Chat]:
    """Send a chat request; the Analyst uses the given fake provider."""

    def send(provider: FakeProvider, messages: list[dict]) -> Response:
        app.dependency_overrides[get_model_provider] = lambda: provider
        return client.post("/api/chat", json={"messages": messages})

    yield send
    app.dependency_overrides.clear()


def visitor(text: str) -> dict:
    return {"role": "visitor", "text": text}


def analyst(text: str) -> dict:
    return {"role": "analyst", "text": text}


def read_events(response: Response) -> list[tuple[str, dict]]:
    """Read the server-sent events in a response as (event name, data) pairs."""
    events = []
    for block in response.text.replace("\r\n", "\n").strip().split("\n\n"):
        fields = dict(
            line.split(": ", 1)
            for line in block.splitlines()
            if not line.startswith(":")  # keep-alive comments
        )
        events.append((fields["event"], json.loads(fields["data"])))
    return events


def test_the_reply_streams_as_text_events_and_ends_with_done(chat: Chat):
    provider = FakeProvider(pieces=["Bumrah ", "bowls ", "yorkers."])

    response = chat(provider, [visitor("Who bowls at the death?")])

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert read_events(response) == [
        ("text", {"text": "Bumrah "}),
        ("text", {"text": "bowls "}),
        ("text", {"text": "yorkers."}),
        ("done", {}),
    ]


def test_a_rate_limited_model_gives_a_retryable_error_and_no_done(chat: Chat):
    provider = FakeProvider(error=ProviderError(429, "Rate limit exceeded"))

    response = chat(provider, [visitor("Best death bowler?")])

    assert read_events(response) == [
        (
            "error",
            {
                "code": "model_busy",
                "message": (
                    "The Analyst is busy right now. Please try again in a moment."
                ),
                "retryable": True,
            },
        )
    ]


def test_a_model_failure_mid_reply_keeps_the_text_and_ends_with_an_error(chat: Chat):
    provider = FakeProvider(
        pieces=["Use a deep point "],
        error=ProviderError(502, "Provider disconnected unexpectedly"),
    )

    response = chat(provider, [visitor("Field for a leg-spinner?")])

    assert read_events(response) == [
        ("text", {"text": "Use a deep point "}),
        (
            "error",
            {
                "code": "model_unavailable",
                "message": "The Analyst could not answer just now. Please try again.",
                "retryable": True,
            },
        ),
    ]


def test_an_account_problem_is_not_retryable_and_hides_the_provider_detail(
    chat: Chat,
):
    provider = FakeProvider(error=ProviderError(402, "Insufficient credits on key"))

    response = chat(provider, [visitor("Who won the 2011 World Cup?")])

    [(name, data)] = read_events(response)
    assert name == "error"
    assert data == {
        "code": "analyst_offline",
        "message": "The Analyst is offline right now. Please try again later.",
        "retryable": False,
    }
    assert "credits" not in response.text


def test_only_the_last_20_messages_reach_the_model(chat: Chat):
    provider = FakeProvider(pieces=["OK."])
    messages = [
        visitor(f"Question {n}") if n % 2 else analyst(f"Answer {n}")
        for n in range(1, 26)
    ]  # 25 Messages: Question 1, Answer 2, ..., Question 25; keep 6 to 25

    chat(provider, messages)

    system, *history = provider.received
    assert system["role"] == "system"
    assert len(history) == 20
    assert history[0] == {"role": "assistant", "content": "Answer 6"}
    assert history[1] == {"role": "user", "content": "Question 7"}
    assert history[-1] == {"role": "user", "content": "Question 25"}


def test_a_message_over_2000_characters_is_refused_before_any_model_call(
    chat: Chat,
):
    provider = FakeProvider(pieces=["never sent"])

    response = chat(provider, [visitor("x" * 2001)])

    assert response.status_code == 422
    assert provider.received == []


def test_an_empty_reply_is_a_retryable_error(chat: Chat):
    provider = FakeProvider(pieces=[])

    response = chat(provider, [visitor("Hello?")])

    assert read_events(response) == [
        (
            "error",
            {
                "code": "empty_reply",
                "message": "The Analyst sent an empty reply. Please try again.",
                "retryable": True,
            },
        )
    ]


def test_an_unexpected_server_failure_still_ends_the_stream_with_an_error(
    chat: Chat,
):
    class BrokenProvider(FakeProvider):
        async def stream_reply(self, messages):
            yield "Half a "
            raise RuntimeError("bug in our code")

    response = chat(BrokenProvider(), [visitor("Hi")])

    assert read_events(response) == [
        ("text", {"text": "Half a "}),
        (
            "error",
            {
                "code": "internal_error",
                "message": "Something went wrong on our side. Please try again.",
                "retryable": True,
            },
        ),
    ]


def test_a_long_analyst_reply_in_the_history_is_accepted(chat: Chat):
    provider = FakeProvider(pieces=["Sure."])
    long_reply = "A detailed plan for the death overs. " * 150  # about 5,500 characters

    response = chat(
        provider,
        [
            visitor("Plan the last 2 overs"),
            analyst(long_reply),
            visitor("And for ODIs?"),
        ],
    )

    assert response.status_code == 200
    assert read_events(response) == [("text", {"text": "Sure."}), ("done", {})]
