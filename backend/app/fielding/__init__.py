"""Fielding restrictions and the Field placement shape.

The limits live in restrictions.json, the one data file that the server and the
browser both read (docs/adr/0003). This module checks a Field placement that the
Analyst sends through the `show_field_placement` tool.
"""

import json
import math
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

RESTRICTIONS = json.loads((Path(__file__).parent / "restrictions.json").read_text())

POSITIONS: list[str] = RESTRICTIONS["positions"]
CIRCLE_RADIUS: float = RESTRICTIONS["circle_radius"]
STRIKER_Y: float = RESTRICTIONS["striker"]["y"]
NOT_COUNTED: set[str] = set(RESTRICTIONS["not_counted"])
OFF_SIDE: set[str] = set(RESTRICTIONS["off_side_positions"])
LEG_SIDE: set[str] = set(RESTRICTIONS["leg_side_positions"])
# A fielder this close to the line of the Pitch can be on either side.
SIDE_TOLERANCE = 0.05

Format = Literal["T20", "ODI", "Test"]
Phase = Literal["powerplay", "middle", "death"]
Coordinate = Annotated[float, Field(ge=-1, le=1)]


class Fielder(BaseModel):
    position: str
    x: Coordinate
    y: Coordinate

    @field_validator("position")
    @classmethod
    def known_position(cls, name: str) -> str:
        name = name.strip().lower()
        if name not in POSITIONS:
            raise ValueError(f"{name!r} is not a Fielding position name")
        return name


class FieldPlacement(BaseModel):
    """Eleven fielders (bowler and wicketkeeper included) for a Format and Phase."""

    format: Format
    phase: Phase
    bowler_type: Annotated[str, Field(min_length=1, max_length=60)]
    batter_hand: Literal["right", "left"]
    fielders: list[Fielder]

    @field_validator("fielders")
    @classmethod
    def eleven_on_the_ground(cls, fielders: list[Fielder]) -> list[Fielder]:
        if len(fielders) != 11:
            raise ValueError(f"need exactly 11 fielders, got {len(fielders)}")
        names = [fielder.position for fielder in fielders]
        for role in ("bowler", "wicketkeeper"):
            if names.count(role) != 1:
                raise ValueError(f"need exactly one {role}")
        for fielder in fielders:
            if math.hypot(fielder.x, fielder.y) > RESTRICTIONS["ground_radius"]:
                raise ValueError(f"{fielder.position} must stand inside the Ground")
        return fielders


class Violation(BaseModel):
    """A broken Fielding restriction. `code` is shared with the browser's check."""

    code: Literal["too_many_outside_circle", "too_many_behind_square_leg_side"]
    message: str


def check_restrictions(field: FieldPlacement) -> list[Violation]:
    """The Fielding restrictions this Field placement breaks (empty when legal)."""
    counted = [f for f in field.fielders if f.position not in NOT_COUNTED]
    violations = []

    limit = RESTRICTIONS["max_outside_circle"][field.format][field.phase]
    outside = [f.position for f in counted if math.hypot(f.x, f.y) > CIRCLE_RADIUS]
    if limit is not None and len(outside) > limit:
        violations.append(
            Violation(
                code="too_many_outside_circle",
                message=(
                    f"{len(outside)} fielders are outside the 30-yard circle "
                    f"({', '.join(outside)}); {field.format} {field.phase} allows "
                    f"at most {limit}. Move {len(outside) - limit} of them inside "
                    f"the circle (distance from (0, 0) at most {CIRCLE_RADIUS})."
                    + _bring_in_hint(field, outside, len(outside) - limit)
                ),
            )
        )

    # Leg side: x > 0 for a right-handed batter, x < 0 for a left-hander.
    # Behind square: further back than the striker (y > the striker's y).
    leg_sign = 1 if field.batter_hand == "right" else -1
    leg_limit = RESTRICTIONS["max_behind_square_leg_side"]
    behind = [f.position for f in counted if f.x * leg_sign > 0 and f.y > STRIKER_Y]
    if len(behind) > leg_limit:
        violations.append(
            Violation(
                code="too_many_behind_square_leg_side",
                message=(
                    f"{len(behind)} fielders are behind square on the leg side "
                    f"({', '.join(behind)}); at most {leg_limit} are allowed. Move "
                    f"{len(behind) - leg_limit} of them in front of square "
                    f"(y at most {STRIKER_Y}) or to the off side."
                ),
            )
        )
    return violations


def _bring_in_hint(field: FieldPlacement, outside: list[str], count: int) -> str:
    """Name deep fielders to swap for their inner positions, at standard spots."""
    taken = {f.position for f in field.fielders}
    swaps = []
    for name in reversed(outside):
        inner = RESTRICTIONS["inner_position_for"].get(name)
        if inner and inner not in taken and len(swaps) < count:
            taken.add(inner)
            spot = RESTRICTIONS["standard_spots_right_hander"][inner]
            x = spot["x"] if field.batter_hand == "right" else -spot["x"]
            swaps.append(f"{name} -> {inner} ({x}, {spot['y']})")
    return f" For example: {'; '.join(swaps)}." if swaps else ""


def read_field_placement(arguments: str) -> tuple[FieldPlacement | None, list[str]]:
    """Read the tool call's JSON arguments.

    Returns the Field placement and no problems, or None and the problems in
    short sentences that the model can act on when it repairs the field.
    """
    try:
        data = json.loads(arguments)
    except json.JSONDecodeError:
        return None, ["The arguments are not valid JSON."]
    try:
        field = FieldPlacement.model_validate(data)
    except ValidationError as error:
        return None, [_problem(detail) for detail in error.errors()]
    problems = [v.message for v in check_restrictions(field)] + check_sides(field)
    if problems:
        return None, problems
    return field, []


def check_sides(field: FieldPlacement) -> list[str]:
    """Fielders standing on the wrong side for their names (not a Fielding
    restriction, but a field that would teach the Visitor something wrong).
    Prior art: the side check in docs/model-eval/scripts/score.py.
    """
    off_sign = -1 if field.batter_hand == "right" else 1
    off = f"x {'<' if off_sign < 0 else '>'} 0 for a {field.batter_hand}-hander"
    leg = f"x {'>' if off_sign < 0 else '<'} 0 for a {field.batter_hand}-hander"
    problems = []
    for fielder in field.fielders:
        if abs(fielder.x) < SIDE_TOLERANCE:
            continue
        on_off_side = math.copysign(1, fielder.x) == off_sign
        if fielder.position in OFF_SIDE and not on_off_side:
            problems.append(f"{fielder.position} should be on the off side ({off}).")
        if fielder.position in LEG_SIDE and on_off_side:
            problems.append(f"{fielder.position} should be on the leg side ({leg}).")
    keeper = next(f for f in field.fielders if f.position == "wicketkeeper")
    if keeper.y <= STRIKER_Y:
        problems.append(
            f"The wicketkeeper should stand behind the striker (y > {STRIKER_Y})."
        )
    return problems


def _problem(detail: dict) -> str:
    where = ".".join(str(part) for part in detail["loc"])
    message = detail["msg"].removeprefix("Value error, ")
    return f"{where}: {message}" if where else message


def _spots_text() -> str:
    spots = RESTRICTIONS["standard_spots_right_hander"]
    return "; ".join(f"{name} ({s['x']}, {s['y']})" for name, s in spots.items())


def _limits_text() -> str:
    lines = []
    for format_, phases in RESTRICTIONS["max_outside_circle"].items():
        if all(limit is None for limit in phases.values()):
            lines.append(f"{format_}: no limit outside the circle")
            continue
        overs = RESTRICTIONS["phase_overs"][format_]
        parts = [
            f"{phase} (overs {overs[phase]}) at most {n}" for phase, n in phases.items()
        ]
        lines.append(f"{format_}: " + ", ".join(parts))
    return "; ".join(lines)


# The tool the Analyst calls to put a Field placement on the Board.
# The JSON Schema helps the model; the server still checks every call.
SHOW_FIELD_PLACEMENT = {
    "type": "function",
    "function": {
        "name": "show_field_placement",
        "description": (
            "Show a cricket Field placement on the Board under your reply. "
            "Call it once when the Visitor asks for a field, or when a field "
            "makes your answer clearer. List all 11 fielders, including "
            "'bowler' and 'wicketkeeper'. Coordinates: the Ground is a circle of "
            "radius 1 at (0, 0). The striker stands at (0, 0.1) facing the "
            "bowler at (0, -0.15); the wicketkeeper is behind the striker "
            "(y > 0.1). For a right-handed batter the off side is x < 0; for a "
            "left-handed batter the off side is x > 0. The 30-yard circle has "
            f"radius {CIRCLE_RADIUS}. Fielders outside the circle, not counting "
            f"the bowler and wicketkeeper: {_limits_text()}. In every Format at "
            f"most {RESTRICTIONS['max_behind_square_leg_side']} fielders may be "
            "behind square on the leg side (y > 0.1 on the leg side). "
            "Standard spots (x, y) for a RIGHT-handed batter; for a left-handed "
            "batter keep y and flip the sign of x: "
            f"{_spots_text()}. Start from these spots and adjust them a little "
            "if the plan needs it."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "format": {"type": "string", "enum": ["T20", "ODI", "Test"]},
                "phase": {"type": "string", "enum": ["powerplay", "middle", "death"]},
                "bowler_type": {
                    "type": "string",
                    "description": "For example 'right-arm fast' or 'left-arm spin'.",
                },
                "batter_hand": {"type": "string", "enum": ["right", "left"]},
                "fielders": {
                    "type": "array",
                    "minItems": 11,
                    "maxItems": 11,
                    "items": {
                        "type": "object",
                        "properties": {
                            "position": {"type": "string", "enum": POSITIONS},
                            "x": {"type": "number", "minimum": -1, "maximum": 1},
                            "y": {"type": "number", "minimum": -1, "maximum": 1},
                        },
                        "required": ["position", "x", "y"],
                    },
                },
            },
            "required": ["format", "phase", "bowler_type", "batter_hand", "fielders"],
        },
    },
}
