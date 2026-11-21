"""The input guard: limits a chat request must meet before the model sees it.

This slice checks images: at most 4 per Message, and each one must really be
the type it claims (so the model gets the right MIME type). The request body
size is limited in `main.py` (`max_body_size`). Ticket 08 adds the
prompt-injection screen here.
"""

import base64
import binascii
from collections.abc import Sequence

from app.analyst import ChatMessage, ImageAttachment
from app.events import ErrorEvent

MAX_IMAGES_PER_MESSAGE = 4

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


def check_request(messages: Sequence[ChatMessage]) -> ErrorEvent | None:
    """Return an error event if the request breaks a limit, else None."""
    for message in messages:
        if message.role != "visitor":
            continue
        if len(message.images) > MAX_IMAGES_PER_MESSAGE:
            return TOO_MANY_IMAGES
        if not all(_is_what_it_says(image) for image in message.images):
            return IMAGE_UNREADABLE
    return None


def _is_what_it_says(image: ImageAttachment) -> bool:
    """True if the data is valid base64 and starts like its MIME type says."""
    try:
        data = base64.b64decode(image.data, validate=True)
    except binascii.Error:
        return False
    # Each format starts with fixed "magic" bytes.
    if image.media_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if image.media_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"  # image/webp
