"""A fake model-provider adapter for tests: no network, a scripted reply."""

from collections.abc import AsyncIterator, Sequence

from app.model_provider import ProviderError, ProviderMessage


class FakeProvider:
    """Streams the given text pieces, then fails with `error` if one is given."""

    def __init__(
        self, pieces: Sequence[str] = (), error: ProviderError | None = None
    ) -> None:
        self.pieces = pieces
        self.error = error
        self.received: list[ProviderMessage] = []

    async def stream_reply(
        self, messages: Sequence[ProviderMessage]
    ) -> AsyncIterator[str]:
        self.received = list(messages)
        for piece in self.pieces:
            yield piece
        if self.error is not None:
            raise self.error
