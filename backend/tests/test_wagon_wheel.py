"""Seam 1 for "Ask the Analyst about this Wagon wheel": POST /api/chat with a
Wagon wheel as Board state. Every Shot, and the run totals by area that the
server counts itself, must reach the model's prompt.

The expected areas are worked out by hand: the striker stands at (0, 0.1), and
for a right-handed batter the off side is x < 0. The Ground splits into eight
equal areas around the striker: third man, point, cover and long off on the off
side; long on, midwicket, square leg and fine leg on the leg side.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_model_provider
from tests.fake_provider import FakeProvider
from tests.test_fielding import CASES

client = TestClient(app)

ASK = "What does this Wagon wheel say about the batter?"

SHOTS = [
    {"x": -0.6, "y": -0.3, "runs": 4},  # in front of square on the off side: cover
    {"x": 0.7, "y": 0.2, "runs": 1},  # just behind square on the leg side: square leg
    {"x": 0.5, "y": -0.5, "runs": 6},  # straight-ish on the leg side: long on
    {"x": -0.55, "y": -0.35, "runs": 2},  # cover again
]


@pytest.fixture
def post() -> Iterator:
    provider = FakeProvider(pieces=["Strong through the covers."])
    app.dependency_overrides[get_model_provider] = lambda: provider

    def send(board: dict):
        body = {"messages": [{"role": "visitor", "text": ASK}], "board": board}
        return client.post("/api/chat", json=body), provider

    yield send
    app.dependency_overrides.clear()


def test_the_wagon_wheel_reaches_the_prompt_with_run_totals_by_area(post):
    response, provider = post({"wheel": {"batter_hand": "right", "shots": SHOTS}})

    assert response.status_code == 200
    text = provider.received[-1]["content"]
    assert text.startswith(ASK)
    assert "Wagon wheel" in text
    assert "right-handed batter" in text
    assert "13 runs off 4 Shots" in text
    assert "cover 6 (2 Shots)" in text
    assert "long on 6 (1 Shot)" in text
    assert "square leg 1 (1 Shot)" in text
    assert "No runs: third man, point, long off, midwicket, fine leg." in text
    # Every Shot, in the order it was added.
    assert "1. 4 to cover; 2. 1 to square leg; 3. 6 to long on; 4. 2 to cover." in text


def test_a_left_handers_areas_are_mirrored(post):
    shots = [{"x": -0.6, "y": -0.3, "runs": 4}]  # the leg side for a left-hander

    _, provider = post({"wheel": {"batter_hand": "left", "shots": shots}})

    text = provider.received[-1]["content"]
    assert "left-handed batter" in text
    assert "midwicket 4 (1 Shot)" in text


@pytest.mark.parametrize(
    "board",
    [
        {"wheel": {"batter_hand": "right", "shots": []}},  # nothing to ask about
        {
            "wheel": {
                "batter_hand": "right",
                "shots": [{"x": 0.1, "y": -0.5, "runs": 5}],
            }
        },
        {
            "wheel": {
                "batter_hand": "right",
                "shots": [{"x": 0.9, "y": -0.9, "runs": 4}],
            }
        },
        {},  # neither a field nor a Wagon wheel
        {"field": CASES[0]["field"], "wheel": {"batter_hand": "right", "shots": SHOTS}},
    ],
    ids=["no shots", "five runs", "outside the Ground", "empty", "both"],
)
def test_a_bad_wagon_wheel_is_refused_before_the_model_is_called(post, board):
    response, provider = post(board)

    assert response.status_code == 422
    assert provider.calls == []
