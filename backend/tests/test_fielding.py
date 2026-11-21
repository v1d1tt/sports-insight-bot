"""Seam 2: the Fielding restrictions, run against the shared case table.

The same table (tests/fielding_cases.json) is run by the TypeScript check in
the browser (ticket 06), so the two checks cannot drift apart (docs/adr/0003).
"""

import json
import math
from pathlib import Path

import pytest

from app.fielding import (
    RESTRICTIONS,
    Fielder,
    FieldPlacement,
    check_restrictions,
    check_sides,
    read_field_placement,
)

CASES = json.loads((Path(__file__).parent / "fielding_cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_shared_case(case: dict):
    field = FieldPlacement.model_validate(case["field"])

    codes = [violation.code for violation in check_restrictions(field)]

    assert sorted(codes) == sorted(case["violations"])


def legal_field() -> dict:
    return json.loads(json.dumps(CASES[0]["field"]))


def test_a_legal_field_reads_with_no_problems():
    field, problems = read_field_placement(json.dumps(legal_field()))

    assert problems == []
    assert field is not None and len(field.fielders) == 11


def test_arguments_that_are_not_json_are_a_problem():
    field, problems = read_field_placement("{not json")

    assert field is None
    assert problems == ["The arguments are not valid JSON."]


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        (lambda f: f["fielders"].pop(), "exactly 11 fielders"),
        (lambda f: f["fielders"][2].update(position="slip"), "slip"),
        (lambda f: f["fielders"][2].update(position="bowler"), "one bowler"),
        (lambda f: f["fielders"][3].update(x=1.4), "fielders.3.x"),
        (lambda f: f["fielders"][9].update(x=0.8, y=0.8), "inside the Ground"),
        (lambda f: f.update(format="T10"), "format"),
    ],
)
def test_a_badly_shaped_field_is_a_problem(change, expected):
    data = legal_field()
    change(data)

    field, problems = read_field_placement(json.dumps(data))

    assert field is None
    assert any(expected in problem for problem in problems), problems


def test_a_broken_restriction_is_a_problem_with_a_clear_message():
    data = CASES[3]["field"]  # T20 powerplay, 3 outside the circle

    field, problems = read_field_placement(json.dumps(data))

    assert field is None
    assert problems == [
        "3 fielders are outside the 30-yard circle (deep cover, fine leg, third man); "
        "T20 powerplay allows at most 2. Move 1 of them inside the circle "
        "(distance from (0, 0) at most 0.43). "
        "For example: third man -> short third man (-0.2, 0.35)."
    ]


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        # Slips belong on the off side: x < 0 for a right-hander.
        (lambda f: f["fielders"][2].update(x=0.08), "first slip"),
        # Fine leg belongs on the leg side: x > 0 for a right-hander.
        (lambda f: f["fielders"][9].update(x=-0.35), "fine leg"),
        (lambda f: f["fielders"][1].update(y=-0.05), "wicketkeeper"),
    ],
)
def test_a_fielder_on_the_wrong_side_is_a_problem(change, expected):
    data = legal_field()
    change(data)

    field, problems = read_field_placement(json.dumps(data))

    assert field is None
    assert any(expected in problem for problem in problems), problems


def test_a_left_handers_field_must_be_mirrored():
    data = legal_field()
    data["batter_hand"] = "left"  # the right-hander's field, not mirrored

    _, problems = read_field_placement(json.dumps(data))

    assert "first slip should be on the off side (x > 0 for a left-hander)." in problems


@pytest.mark.parametrize("hand", ["right", "left"])
def test_every_standard_spot_is_on_its_own_side_and_inside_the_ground(hand):
    sign = 1 if hand == "right" else -1  # a left-hander's spots are mirrored
    spots = RESTRICTIONS["standard_spots_right_hander"]
    assert set(spots) == set(RESTRICTIONS["positions"])
    fielders = [
        Fielder(position=name, x=sign * spot["x"], y=spot["y"])
        for name, spot in spots.items()
    ]
    assert all(math.hypot(f.x, f.y) <= 1 for f in fielders)
    # model_construct skips the "exactly 11 fielders" rule: all 39 spots at once.
    field = FieldPlacement.model_construct(batter_hand=hand, fielders=fielders)

    assert check_sides(field) == []
