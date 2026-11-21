"""The seam between the Analyst and a model provider.

The Analyst depends only on this interface. `OpenRouterProvider` (app/openrouter.py)
implements it for real; tests use a fake that streams a scripted reply.
"""

from collections.abc import AsyncGenerator, Sequence
from dataclasses import dataclass
from typing import Any, Literal, NotRequired, Protocol, TypedDict


class ImageUrl(TypedDict):
    url: str  # a data URL: data:<mime type>;base64,<data>


class TextPart(TypedDict):
    type: Literal["text"]
    text: str


class ImagePart(TypedDict):
    type: Literal["image_url"]
    image_url: ImageUrl


class FunctionCall(TypedDict):
    name: str
    arguments: str  # JSON text, as the model wrote it


class ToolCallMessage(TypedDict):
    id: str
    type: Literal["function"]
    function: FunctionCall


class ProviderMessage(TypedDict):
    """One chat message in the format model providers expect.

    `content` is plain text, or a list of parts when the Message has images
    (OpenAI-style content parts, which OpenRouter's chat completions API takes).
    An assistant message that called a tool has `tool_calls`; the answer to a
    tool call is a `tool` message with the call's `tool_call_id`.
    """

    role: Literal["system", "user", "assistant", "tool"]
    content: str | list[TextPart | ImagePart] | None
    tool_calls: NotRequired[list[ToolCallMessage]]
    tool_call_id: NotRequired[str]


class ToolFunction(TypedDict):
    name: str
    description: str
    parameters: dict[str, Any]  # a JSON Schema


class Tool(TypedDict):
    """A tool the model may call (OpenAI-style function tool)."""

    type: Literal["function"]
    function: ToolFunction


@dataclass(frozen=True)
class ToolCall:
    """A complete tool call from the model. `arguments` is JSON text."""

    id: str
    name: str
    arguments: str

    def as_message(self) -> ToolCallMessage:
        return {
            "id": self.id,
            "type": "function",
            "function": {"name": self.name, "arguments": self.arguments},
        }


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
        self,
        messages: Sequence[ProviderMessage],
        tools: Sequence[Tool] | None = None,
        tool_choice: Literal["auto", "none"] = "auto",
    ) -> AsyncGenerator[str | ToolCall, None]:
        """Stream the reply as text pieces, then any complete tool calls.

        `tools` offers tools to the model; `tool_choice="none"` forbids calling
        them (the tools must still be sent when the messages hold tool results).
        Raises ProviderError on failure.
        """
        ...
