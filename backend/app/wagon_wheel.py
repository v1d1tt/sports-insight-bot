"""The Wagon wheel: a batter's Shots, and the run totals by area of the Ground.

The browser draws the totals itself (frontend/src/lib/wagon-wheel.ts). The
server counts them again from the Shots, so the prompt never relies on numbers
sent by the page, and the model does not have to count.
"""

import math
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.fielding import STRIKER_Y

# The eight areas, each 45 degrees wide, measured from the striker. Off side
# from behind the wicket round to straight, then the leg side the same way.
OFF_AREAS = ["long off", "cover", "point", "third man"]  # from straight round
LEG_AREAS = ["long on", "midwicket", "square leg", "fine leg"]
AREAS = list(reversed(OFF_AREAS)) + LEG_AREAS  # third man … fine leg

# An innings rarely has more than 150 scoring Shots; this only stops abuse.
MAX_SHOTS = 300


class Shot(BaseModel):
    """Where the ball went (Ground units, see restrictions.json) and its runs."""

    x: Annotated[float, Field(ge=-1, le=1)]
    y: Annotated[float, Field(ge=-1, le=1)]
    runs: Literal[1, 2, 3, 4, 6]

    @model_validator(mode="after")
    def on_the_ground(self) -> "Shot":
        if math.hypot(self.x, self.y) > 1:
            raise ValueError("a Shot must end on the Ground")
        return self


class WagonWheel(BaseModel):
    batter_hand: Literal["right", "left"]
    shots: Annotated[list[Shot], Field(min_length=1, max_length=MAX_SHOTS)]


def area_of(shot: Shot, batter_hand: str) -> str:
    """The area of the Ground a Shot went to, for this Batter hand."""
    # For a right-hander the off side is x < 0; mirror for a left-hander.
    leg_x = shot.x if batter_hand == "right" else -shot.x
    towards_bowler = STRIKER_Y - shot.y
    angle = math.degrees(math.atan2(leg_x, towards_bowler))  # 0 = straight
    index = min(3, int(abs(angle) // 45))
    return LEG_AREAS[index] if angle >= 0 else OFF_AREAS[index]


def _count(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def _shots(count: int) -> str:
    return _count(count, "Shot", "Shots")


def wheel_text(wheel: WagonWheel) -> str:
    """The Wagon wheel as data for the model, put after the Visitor's question."""
    areas = [area_of(shot, wheel.batter_hand) for shot in wheel.shots]
    runs = {area: 0 for area in AREAS}
    shots = {area: 0 for area in AREAS}
    for shot, area in zip(wheel.shots, areas, strict=True):
        runs[area] += shot.runs
        shots[area] += 1
    total = sum(runs.values())
    scoring = sorted((a for a in AREAS if shots[a]), key=lambda a: -runs[a])
    by_area = ", ".join(f"{a} {runs[a]} ({_shots(shots[a])})" for a in scoring)
    empty = [a for a in AREAS if not shots[a]]
    no_runs = f" No runs: {', '.join(empty)}." if empty else ""
    fours = sum(1 for shot in wheel.shots if shot.runs == 4)
    sixes = sum(1 for shot in wheel.shots if shot.runs == 6)
    in_order = "; ".join(
        f"{i}. {shot.runs} to {area}"
        for i, (shot, area) in enumerate(zip(wheel.shots, areas, strict=True), 1)
    )
    return (
        "[Board state] The Visitor recorded a Wagon wheel on the Board for a "
        f"{wheel.batter_hand}-handed batter and asks what it says. Explain the "
        "batter's scoring areas, strengths and weaknesses, and how you would "
        "bowl and set a field to them. Use these totals (already counted); do "
        "not count again and do not mention coordinates.\n"
        f"{total} runs off {_shots(len(wheel.shots))} "
        f"({_count(fours, 'four', 'fours')}, {_count(sixes, 'six', 'sixes')}).\n"
        f"Runs by area: {by_area}.{no_runs}\n"
        f"Shots in order: {in_order}."
    )
