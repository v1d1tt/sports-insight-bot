"""A fake injection screen for tests: no network, a scripted verdict."""

from collections.abc import Sequence
from dataclasses import dataclass

from app.analyst import ImageAttachment
from app.injection_screen import ScreenError


@dataclass
class ScreenCall:
    """What one screen call received."""

    texts: list[str]
    images: list[ImageAttachment]


class FakeScreen:
    """Flags every input when `flag` is True; raises `error` when given."""

    def __init__(self, flag: bool = False, error: ScreenError | None = None) -> None:
        self.flag = flag
        self.error = error
        self.calls: list[ScreenCall] = []

    async def is_injection(
        self, texts: Sequence[str], images: Sequence[ImageAttachment]
    ) -> bool:
        self.calls.append(ScreenCall(list(texts), list(images)))
        if self.error is not None:
            raise self.error
        return self.flag
