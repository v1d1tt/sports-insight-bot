"""Seam 1, slice 03: images in Messages and the Sport focus, via POST /api/chat."""

import base64
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app, get_model_provider
from tests.fake_provider import FakeProvider
from tests.test_chat_api import read_events

client = TestClient(app)

# The first bytes of each format are enough: the fake provider never decodes them.
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 32


def image(media_type: str, data: bytes) -> dict:
    return {"media_type": media_type, "data": base64.b64encode(data).decode()}


PNG = image("image/png", PNG_BYTES)
JPEG = image("image/jpeg", JPEG_BYTES)


@pytest.fixture
def provider() -> Iterator[FakeProvider]:
    fake = FakeProvider(pieces=["OK."])
    app.dependency_overrides[get_model_provider] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


def send(body: dict) -> Response:
    return client.post("/api/chat", json=body)


def visitor(text: str, images: list[dict] | None = None) -> dict:
    message: dict = {"role": "visitor", "text": text}
    if images is not None:
        message["images"] = images
    return message


def test_images_reach_the_model_with_their_own_mime_type(provider: FakeProvider):
    response = send({"messages": [visitor("Which field is this?", [PNG, JPEG])]})

    assert read_events(response)[-1] == ("done", {})
    content = provider.received[-1]["content"]
    assert content[0] == {"type": "text", "text": "Which field is this?"}
    images = [
        part["image_url"]["url"] for part in content if part["type"] == "image_url"
    ]
    assert images == [
        "data:image/png;base64," + PNG["data"],
        "data:image/jpeg;base64," + JPEG["data"],
    ]


def test_text_read_from_images_is_labelled_as_untrusted(provider: FakeProvider):
    send({"messages": [visitor("What does the scoreboard say?", [PNG])]})

    system = provider.received[0]["content"]
    content = provider.received[-1]["content"]
    first_image = next(
        i for i, part in enumerate(content) if part["type"] == "image_url"
    )
    label = content[first_image - 1]
    assert label["type"] == "text"
    assert "untrusted" in label["text"].lower()
    assert "instructions" in label["text"].lower()
    # The system prompt states the same rule, so the label has a reason to be obeyed.
    assert "untrusted" in system.lower()


def test_a_message_can_be_only_images(provider: FakeProvider):
    response = send({"messages": [visitor("", [JPEG])]})

    assert read_events(response)[-1] == ("done", {})
    assert provider.received[-1]["content"][-1]["type"] == "image_url"


def test_a_message_with_no_text_and_no_images_is_refused(provider: FakeProvider):
    response = send({"messages": [visitor("", [])]})

    assert response.status_code == 422
    assert provider.received == []


def test_more_than_4_images_in_a_message_is_a_clear_error(provider: FakeProvider):
    response = send({"messages": [visitor("Compare these", [PNG] * 5)]})

    assert read_events(response) == [
        (
            "error",
            {
                "code": "too_many_images",
                "message": (
                    "You can send up to 4 images in one Message. "
                    "Remove some and try again."
                ),
                "retryable": False,
            },
        )
    ]
    assert provider.received == []


@pytest.mark.parametrize(
    "bad_image",
    [
        image("image/png", JPEG_BYTES),  # says PNG, is JPEG
        {"media_type": "image/jpeg", "data": "not base64!"},
    ],
)
def test_an_image_that_is_not_what_it_says_is_a_clear_error(
    provider: FakeProvider, bad_image: dict
):
    response = send({"messages": [visitor("Look", [PNG, bad_image])]})

    assert read_events(response) == [
        (
            "error",
            {
                "code": "image_unreadable",
                "message": (
                    "One of the images could not be read. Remove it and try again."
                ),
                "retryable": False,
            },
        )
    ]
    assert provider.received == []


def test_webp_is_accepted_and_other_types_are_refused(provider: FakeProvider):
    webp = image("image/webp", WEBP_BYTES)
    assert send({"messages": [visitor("Look", [webp])]}).status_code == 200

    gif = image("image/gif", b"GIF89a" + b"\x00" * 32)
    assert send({"messages": [visitor("Look", [gif])]}).status_code == 422


def test_a_body_over_the_hosts_limit_is_refused_with_413(provider: FakeProvider):
    # Vercel refuses request bodies over 4.5 MB with HTTP 413 before our code runs,
    # so the server answers the same way and the page shows the clear message.
    big = image("image/jpeg", JPEG_BYTES + b"\x00" * 3_500_000)  # about 4.7 MB

    response = send({"messages": [visitor("Huge photo", [big])]})

    assert response.status_code == 413
    assert provider.received == []


def test_the_sport_focus_and_team_reach_the_prompt(provider: FakeProvider):
    send(
        {
            "messages": [visitor("How do we beat a high press?")],
            "sport_focus": {"sport": "football", "team": "Arsenal"},
        }
    )

    system = provider.received[0]["content"]
    assert "Sport focus: football" in system
    assert 'Team: "Arsenal"' in system
    assert "text only" in system.lower()


def test_without_a_sport_focus_the_chat_is_about_cricket(provider: FakeProvider):
    send({"messages": [visitor("Best death bowler?")]})

    system = provider.received[0]["content"]
    assert "Sport focus: cricket" in system
    assert "Team:" not in system


def test_an_unknown_sport_or_a_long_team_name_is_refused(provider: FakeProvider):
    question = [visitor("Hi")]
    assert (
        send({"messages": question, "sport_focus": {"sport": "chess"}}).status_code
        == 422
    )
    long_team = {"sport": "cricket", "team": "x" * 61}
    assert send({"messages": question, "sport_focus": long_team}).status_code == 422
    assert provider.received == []
