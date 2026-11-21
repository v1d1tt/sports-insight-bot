"""The Analyst: turns a Chat's recent Messages into a stream of events.

It hides the prompt, the history limit and the model call. Its only outside
dependency is a ModelProvider.
"""

import logging
from collections.abc import AsyncIterator, Sequence
from contextlib import aclosing
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.events import AnalystEvent, DoneEvent, ErrorEvent, TextEvent
from app.model_provider import ModelProvider, ProviderError, ProviderMessage

logger = logging.getLogger(__name__)

# Each request sends at most this many recent Messages to the model.
MAX_HISTORY = 20

SYSTEM_PROMPT = """\
You are the Analyst in Sports Insight Bot: a sports analyst who explains \
matches, tactics and situations to Visitors.

- Cricket comes first. For cricket, give real tactical depth: bowling plans, \
field settings, batting approach, match situations, and how the Format \
(Test, ODI, T20) and the Phase (powerplay, middle overs, death overs) change them.
- You can also answer questions about other sports, in plain text.
- Be concise. Give the answer first, then the key reasons. Use short \
paragraphs, bullet lists or a small Markdown table when they help.
- Be honest about uncertainty. If you are not sure of a fact, a statistic, \
a player's current team or a recent result, say so plainly. Never invent \
numbers or quotes.
- You have no live match data, and your knowledge stops at your training \
cut-off. Say so when a question needs current information.
"""


class VisitorMessage(BaseModel):
    """A Message the Visitor typed."""

    role: Literal["visitor"]
    text: Annotated[str, Field(min_length=1, max_length=2000)]


class AnalystMessage(BaseModel):
    """An earlier reply of the Analyst, sent back as history."""

    role: Literal["analyst"]
    # Replies are capped at MAX_REPLY_TOKENS (1,500 tokens, about 6,000
    # characters), so this limit only stops abuse.
    text: Annotated[str, Field(min_length=1, max_length=12_000)]


# One Message of a Chat, as the page sends it. Pydantic picks the model by `role`.
ChatMessage = Annotated[VisitorMessage | AnalystMessage, Field(discriminator="role")]


def build_prompt(messages: Sequence[ChatMessage]) -> list[ProviderMessage]:
    prompt: list[ProviderMessage] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for message in messages[-MAX_HISTORY:]:
        role = "user" if message.role == "visitor" else "assistant"
        prompt.append({"role": role, "content": message.text})
    return prompt


def error_for(code: int) -> ErrorEvent:
    """Map a provider error code to a short message the Visitor can act on."""
    if code == 429:
        return ErrorEvent(
            code="model_busy",
            message="The Analyst is busy right now. Please try again in a moment.",
            retryable=True,
        )
    if code == 408 or code >= 500:
        return ErrorEvent(
            code="model_unavailable",
            message="The Analyst could not answer just now. Please try again.",
            retryable=True,
        )
    if code in (401, 402):  # bad key or no credits: only the owner can fix it
        return ErrorEvent(
            code="analyst_offline",
            message="The Analyst is offline right now. Please try again later.",
            retryable=False,
        )
    if code == 403:  # the provider's moderation refused the Message
        return ErrorEvent(
            code="message_rejected",
            message="The Analyst cannot answer this Message. Please rephrase it.",
            retryable=False,
        )
    return ErrorEvent(
        code="bad_request",
        message="The Analyst could not read this Chat. Please start a new Chat.",
        retryable=False,
    )


async def stream_reply(
    messages: Sequence[ChatMessage], provider: ModelProvider
) -> AsyncIterator[AnalystEvent]:
    """Stream the Analyst's reply to the last Message.

    Yields text events, then exactly one done or error event.
    """
    sent_text = False
    try:
        # aclosing() closes the provider's stream as soon as this generator stops,
        # for example when the Visitor presses Stop and the connection drops.
        async with aclosing(provider.stream_reply(build_prompt(messages))) as pieces:
            async for piece in pieces:
                sent_text = True
                yield TextEvent(text=piece)
    except ProviderError as error:
        logger.warning("Model provider error %s: %s", error.code, error.detail)
        yield error_for(error.code)
        return
    except Exception:
        # The HTTP status (200) is already sent, so the stream itself must say
        # that the reply failed. The traceback goes to the server log only.
        logger.exception("Unexpected error while streaming a reply")
        yield ErrorEvent(
            code="internal_error",
            message="Something went wrong on our side. Please try again.",
            retryable=True,
        )
        return
    if not sent_text:
        yield ErrorEvent(
            code="empty_reply",
            message="The Analyst sent an empty reply. Please try again.",
            retryable=True,
        )
        return
    yield DoneEvent()
