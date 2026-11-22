"""The input guard: what a chat request must pass before the main model sees it.

Two steps, both before any reply starts:

1. `check_request()`: the limits. Message length, image count, image size and
   type. The request body size is limited in `main.py` (`max_body_size`), and the
   history is trimmed to the last MAX_HISTORY Messages.
2. `screen_request()`: the prompt-injection screen (defense layer 2), through an
   `InjectionScreen` adapter. To keep the cost low, it screens only the Messages
   that can carry an attack the cheap checks cannot see: Messages with images,
   long Messages, and Messages that mention instructions or rules.

Each step returns None (accept) or the one event to send instead of a reply.
"""

import base64
import binascii
import logging
import re
from collections.abc import Sequence

from app.analyst import MAX_HISTORY, ChatMessage, ImageAttachment
from app.events import BlockedEvent, ErrorEvent
from app.injection_screen import InjectionScreen, ScreenError

logger = logging.getLogger(__name__)

MAX_IMAGES_PER_MESSAGE = 4
MAX_MESSAGE_CHARS = 2000
# The page resizes each image to at most about 700 KB. This limit leaves room.
MAX_IMAGE_BYTES = 1_000_000
# Visitor Messages longer than this are always screened.
SCREEN_FROM_CHARS = 400

# Words that injection attempts use. A match only sends the Message to the
# screen; it never blocks by itself, so a broad list costs a little, not a
# false alarm.
SUSPICIOUS = re.compile(
    r"instruction|system prompt|prompt|ignore (all|any|your|the above|previous)"
    r"|disregard|override|jailbreak|developer mode|you are now|\bact as\b|new rules?"
    r"|\bsystem\s*:|\bassistant\s*:|<\|",
    re.IGNORECASE,
)

MESSAGE_TOO_LONG = ErrorEvent(
    code="message_too_long",
    message=(
        f"A Message can be up to {MAX_MESSAGE_CHARS:,} characters. "
        "Shorten it and try again."
    ),
    retryable=False,
)
TOO_MANY_IMAGES = ErrorEvent(
    code="too_many_images",
    message=(
        f"You can send up to {MAX_IMAGES_PER_MESSAGE} images in one Message. "
        "Remove some and try again."
    ),
    retryable=False,
)
IMAGE_UNREADABLE = ErrorEvent(
    code="image_unreadable",
    message="One of the images could not be read. Remove it and try again.",
    retryable=False,
)
IMAGE_TOO_LARGE = ErrorEvent(
    code="image_too_large",
    message="One of the images is too large. Use a smaller image and try again.",
    retryable=False,
)
SCREEN_UNAVAILABLE = ErrorEvent(
    code="screen_unavailable",
    message=(
        "The safety check could not run just now, so your Message was not sent "
        "to the Analyst. Please try again."
    ),
    retryable=True,
)
BLOCKED = BlockedEvent(
    reason=(
        "This Message looks like it tries to change the Analyst's instructions, "
        "so it was not sent. If that was not your aim, please rephrase it as a "
        "plain sports question, or remove any image with text that gives orders."
    )
)


def check_request(messages: Sequence[ChatMessage]) -> ErrorEvent | None:
    """Return an error event if the request breaks a limit, else None."""
    for message in messages:
        if message.role != "visitor":
            continue
        if len(message.text) > MAX_MESSAGE_CHARS:
            return MESSAGE_TOO_LONG
        if len(message.images) > MAX_IMAGES_PER_MESSAGE:
            return TOO_MANY_IMAGES
        for image in message.images:
            data = _decode(image)
            if data is None or not _is_what_it_says(image, data):
                return IMAGE_UNREADABLE
            if len(data) > MAX_IMAGE_BYTES:
                return IMAGE_TOO_LARGE
    return None


async def screen_request(
    messages: Sequence[ChatMessage], screen: InjectionScreen
) -> BlockedEvent | ErrorEvent | None:
    """Screen the Messages the model will see. Blocked, error, or None (accept).

    Fails closed: if the screen cannot decide, the request does not go on.
    """
    recent = messages[-MAX_HISTORY:]
    texts = [m.text for m in recent if _needs_screen(m)]
    images = [image for m in recent if m.role == "visitor" for image in m.images]
    if not texts and not images:
        return None
    try:
        flagged = await screen.is_injection(texts, images)
    except ScreenError as error:
        logger.warning("Injection screen failed: %s", error)
        return SCREEN_UNAVAILABLE
    if flagged:
        logger.info(
            "Injection screen blocked a request (%d texts, %d images)",
            len(texts),
            len(images),
        )
        return BLOCKED
    return None


def _needs_screen(message: ChatMessage) -> bool:
    if SUSPICIOUS.search(message.text):
        return True
    # A long Analyst reply is normal; a long Visitor Message is screened.
    return message.role == "visitor" and len(message.text) > SCREEN_FROM_CHARS


def _decode(image: ImageAttachment) -> bytes | None:
    try:
        return base64.b64decode(image.data, validate=True)
    except binascii.Error:
        return None


def _is_what_it_says(image: ImageAttachment, data: bytes) -> bool:
    """True if the bytes start like the MIME type says."""
    # Each format starts with fixed "magic" bytes.
    if image.media_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if image.media_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"  # image/webp
