"""The events the Analyst sends to the page, one server-sent event each.

The `type` field becomes the SSE event name; the other fields become the JSON data.
A reply is zero or more `text` events and at most one `field_placement` event,
then exactly one `done` or `error`. A later slice adds `blocked`.
"""

from typing import Literal

from pydantic import BaseModel

from app.fielding import FieldPlacement


class TextEvent(BaseModel):
    """The next piece of the reply text."""

    type: Literal["text"] = "text"
    text: str


class FieldPlacementEvent(BaseModel):
    """A Field placement that passed the Fielding restrictions, for the Board."""

    type: Literal["field_placement"] = "field_placement"
    field: FieldPlacement


class ErrorEvent(BaseModel):
    """The reply failed. `message` is safe to show to the Visitor."""

    type: Literal["error"] = "error"
    code: str
    message: str
    retryable: bool


class DoneEvent(BaseModel):
    """The reply is complete."""

    type: Literal["done"] = "done"


AnalystEvent = TextEvent | FieldPlacementEvent | ErrorEvent | DoneEvent
