"""A fake model-provider adapter for tests: no network, scripted replies."""

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass

from app.model_provider import ProviderError, ProviderMessage, Tool, ToolCall


@dataclass
class Call:
    """What one model call received."""

    messages: list[ProviderMessage]
    tools: list[Tool] | None
    tool_choice: str


class FakeProvider:
    """Answers each model call with the next scripted turn.

    A turn is a list of text pieces and tool calls. `pieces` is a one-turn
    script. After the last piece of the first turn, fails with `error` if given.
    """

    def __init__(
        self,
        pieces: Sequence[str | ToolCall] = (),
        error: ProviderError | None = None,
        turns: Sequence[Sequence[str | ToolCall]] | None = None,
    ) -> None:
        self.turns = list(turns) if turns is not None else [pieces]
        self.error = error
        self.calls: list[Call] = []

    @property
    def received(self) -> list[ProviderMessage]:
        """The messages of the first model call (empty when none was made)."""
        return self.calls[0].messages if self.calls else []

    async def stream_reply(
        self,
        messages: Sequence[ProviderMessage],
        tools: Sequence[Tool] | None = None,
        tool_choice: str = "auto",
    ) -> AsyncIterator[str | ToolCall]:
        turn = len(self.calls)
        self.calls.append(
            Call(list(messages), list(tools) if tools else None, tool_choice)
        )
        for piece in self.turns[turn] if turn < len(self.turns) else []:
            yield piece
        if self.error is not None and turn == 0:
            raise self.error
