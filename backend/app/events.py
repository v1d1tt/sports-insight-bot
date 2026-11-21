"""The events the Analyst sends to the page, one server-sent event each.

The `type` field becomes the SSE event name; the other fields become the JSON data.
A reply is zero or more `text` events, then exactly one `done` or `error`.
Later slices add more event types (for example `field_placement` and `blocked`).
"""

from typing import Literal

from pydantic import BaseModel


class TextEvent(BaseModel):
    """The next piece of the reply text."""

    type: Literal["text"] = "text"
    text: str


class ErrorEvent(BaseModel):
    """The reply failed. `message` is safe to show to the Visitor."""

    type: Literal["error"] = "error"
    code: str
    message: str
    retryable: bool


class DoneEvent(BaseModel):
    """The reply is complete."""

    type: Literal["done"] = "done"


AnalystEvent = TextEvent | ErrorEvent | DoneEvent
