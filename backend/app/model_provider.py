"""The seam between the Analyst and a model provider.

The Analyst depends only on this interface. `OpenRouterProvider` (app/openrouter.py)
implements it for real; tests use a fake that streams a scripted reply.
"""

from collections.abc import AsyncGenerator, Sequence
from typing import Literal, Protocol, TypedDict


class ProviderMessage(TypedDict):
    """One chat message in the format model providers expect."""

    role: Literal["system", "user", "assistant"]
    content: str


class ProviderError(Exception):
    """The model provider failed.

    `code` uses OpenRouter's error codes, which follow HTTP status codes:
    408 timeout, 429 rate limited, 402 no credits, 502/503 model down, and so on.
    `detail` is for the server log only. Never send it to the Visitor.
    """

    def __init__(self, code: int, detail: str = "") -> None:
        super().__init__(f"Model provider error {code}: {detail}")
        self.code = code
        self.detail = detail


class ModelProvider(Protocol):
    def stream_reply(
        self, messages: Sequence[ProviderMessage]
    ) -> AsyncGenerator[str, None]:
        """Stream the reply as text pieces. Raises ProviderError on failure."""
        ...
