"""The real model provider: OpenRouter's chat completions API, streamed.

OpenRouter streams server-sent events. Each `data:` line holds a JSON chunk
with the next piece of text in `choices[0].delta.content`; the line
`data: [DONE]` ends the stream. Lines that start with `:` are keep-alive
comments. An error after the stream has started arrives as a chunk with a
top-level `error` object (the HTTP status is already 200 then).
"""

import json
from collections.abc import AsyncGenerator, Sequence

import httpx2
from pydantic import SecretStr

from app.model_provider import ProviderError, ProviderMessage

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Upper limit for one reply: keeps the cost and the stream time small.
MAX_REPLY_TOKENS = 1500


class OpenRouterProvider:
    def __init__(
        self, client: httpx2.AsyncClient, api_key: SecretStr, model: str
    ) -> None:
        self._client = client
        self._api_key = api_key
        self._model = model

    async def stream_reply(
        self, messages: Sequence[ProviderMessage]
    ) -> AsyncGenerator[str, None]:
        body = {
            "model": self._model,
            "messages": list(messages),
            "stream": True,
            "max_tokens": MAX_REPLY_TOKENS,
        }
        headers = {"Authorization": f"Bearer {self._api_key.get_secret_value()}"}
        try:
            async with self._client.stream(
                "POST", OPENROUTER_URL, json=body, headers=headers
            ) as response:
                if response.status_code != 200:
                    await response.aread()
                    raise ProviderError(response.status_code, _error_detail(response))
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue  # blank lines and ": OPENROUTER PROCESSING" comments
                    data = line.removeprefix("data:").strip()
                    if data == "[DONE]":
                        return
                    for piece in _text_pieces(data):
                        yield piece
        except httpx2.TimeoutException as error:
            raise ProviderError(408, "Timed out waiting for OpenRouter") from error
        except httpx2.TransportError as error:
            raise ProviderError(
                502, f"Lost the connection to OpenRouter: {type(error).__name__}"
            ) from error


def _text_pieces(data: str) -> list[str]:
    """Read one stream chunk. Raises ProviderError if it is an error chunk."""
    try:
        chunk = json.loads(data)
    except json.JSONDecodeError as error:
        raise ProviderError(502, "OpenRouter sent a chunk that is not JSON") from error
    if "error" in chunk:
        error = chunk["error"]
        raise ProviderError(int(error.get("code", 502)), str(error.get("message", "")))
    pieces = []
    for choice in chunk.get("choices", []):
        text = (choice.get("delta") or {}).get("content")
        if text:
            pieces.append(text)
    return pieces


def _error_detail(response: httpx2.Response) -> str:
    """The provider's own error message, for the server log only."""
    try:
        return str(response.json()["error"]["message"])
    except (ValueError, KeyError, TypeError):
        return response.text[:200]
