"""Seam 1 for the Board: POST /api/chat with a fake model that calls
`show_field_placement`. The server checks every Field placement against the
Fielding restrictions and asks the model to repair a bad one once.
"""

import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_model_provider
from app.model_provider import ToolCall
from tests.fake_provider import FakeProvider
from tests.test_chat_api import read_events
from tests.test_fielding import CASES

client = TestClient(app)

LEGAL = CASES[0]["field"]  # T20 powerplay, right-hander, legal
TOO_MANY_OUTSIDE = CASES[3]["field"]  # T20 powerplay, 3 outside the circle
ASK = [{"role": "visitor", "text": "Set a T20 powerplay field for a quick."}]


def field_call(field: dict, call_id: str = "call_1") -> ToolCall:
    return ToolCall(
        id=call_id, name="show_field_placement", arguments=json.dumps(field)
    )


@pytest.fixture
def send() -> Iterator:
    def post(provider: FakeProvider, sport: str = "cricket"):
        app.dependency_overrides[get_model_provider] = lambda: provider
        body = {"messages": ASK, "sport_focus": {"sport": sport}}
        return read_events(client.post("/api/chat", json=body))

    yield post
    app.dependency_overrides.clear()


def test_a_valid_tool_call_becomes_a_field_placement_event(send):
    provider = FakeProvider(
        turns=[
            ["Two slips and a gully. ", field_call(LEGAL)],
            ["Fine leg and third man stay back."],
        ]
    )

    events = send(provider)

    assert events == [
        ("text", {"text": "Two slips and a gully. "}),
        ("field_placement", {"field": LEGAL}),
        ("text", {"text": "Fine leg and third man stay back."}),
        ("done", {}),
    ]


def test_after_a_shown_field_the_model_writes_text_without_calling_again(send):
    provider = FakeProvider(turns=[[field_call(LEGAL)], ["Here is the plan."]])

    send(provider)

    first, second = provider.calls
    assert [tool["function"]["name"] for tool in first.tools] == [
        "show_field_placement"
    ]
    # OpenRouter needs the tools again with a tool result; "none" stops a 2nd field.
    assert second.tools == first.tools and second.tool_choice == "none"
    assistant, result = second.messages[-2:]
    assert assistant["tool_calls"][0]["id"] == "call_1"
    assert result["role"] == "tool" and result["tool_call_id"] == "call_1"


def test_an_invalid_field_is_sent_back_once_for_repair(send):
    provider = FakeProvider(
        turns=[
            [field_call(TOO_MANY_OUTSIDE, "call_1")],
            [field_call(LEGAL, "call_2")],
            ["Fixed: only two back."],
        ]
    )

    events = send(provider)

    assert events == [
        ("field_placement", {"field": LEGAL}),
        ("text", {"text": "Fixed: only two back."}),
        ("done", {}),
    ]
    repair = provider.calls[1]
    assert repair.tool_choice == "auto"
    feedback = repair.messages[-1]
    assert feedback["role"] == "tool" and feedback["tool_call_id"] == "call_1"
    assert "outside the 30-yard circle" in feedback["content"]


def test_a_second_invalid_field_falls_back_to_text_only(send):
    provider = FakeProvider(
        turns=[
            [field_call(TOO_MANY_OUTSIDE, "call_1")],
            [field_call(TOO_MANY_OUTSIDE, "call_2")],
            ["Keep two men back: fine leg and third man."],
        ]
    )

    events = send(provider)

    assert events == [
        ("text", {"text": "Keep two men back: fine leg and third man."}),
        ("done", {}),
    ]
    # The fallback is a plain text call: no tools and no failed attempts.
    first, _, fallback = provider.calls
    assert fallback.tools is None
    assert fallback.messages[1:] == first.messages[1:]
    assert "text only" in fallback.messages[0]["content"]


def test_tool_arguments_that_are_not_json_are_repaired_too(send):
    bad = ToolCall(id="call_1", name="show_field_placement", arguments="{oops")
    provider = FakeProvider(turns=[[bad], [field_call(LEGAL, "call_2")], ["Done."]])

    events = send(provider)

    assert ("field_placement", {"field": LEGAL}) in events


def test_a_left_handers_field_reaches_the_page_as_sent(send):
    mirrored = CASES[1]["field"]
    provider = FakeProvider(turns=[[field_call(mirrored)], ["Mirrored."]])

    events = send(provider)

    assert events[0] == ("field_placement", {"field": mirrored})


@pytest.mark.parametrize("sport", ["football", "basketball", "tennis", "other"])
def test_the_tool_is_not_offered_outside_cricket(send, sport):
    provider = FakeProvider(pieces=["Press high."])

    events = send(provider, sport)

    assert provider.calls[0].tools is None
    assert events == [("text", {"text": "Press high."}), ("done", {})]


def test_a_reply_with_only_text_makes_one_model_call(send):
    provider = FakeProvider(pieces=["Bowl a yorker."])

    send(provider)

    assert len(provider.calls) == 1


def test_a_call_to_any_other_tool_is_ignored(send):
    # An injection might talk the model into a tool it was never offered.
    other = ToolCall(id="call_1", name="send_email", arguments=json.dumps(LEGAL))
    provider = FakeProvider(turns=[["Here is my plan. ", other]])

    events = send(provider)

    assert events == [("text", {"text": "Here is my plan. "}), ("done", {})]
    assert len(provider.calls) == 1
