"""The real OpenRouter adapter, tested against recorded stream bytes.

httpx2.MockTransport answers the requests, so no test calls the network.
The stream shapes come from OpenRouter's streaming docs.
"""

import json
from collections.abc import Callable

import httpx2
import pytest
from pydantic import SecretStr

from app.model_provider import ProviderError, ToolCall
from app.openrouter import OpenRouterProvider

pytestmark = pytest.mark.anyio

QUESTION = [{"role": "user", "content": "Who bowls at the death?"}]


def provider_answering(
    handler: Callable[[httpx2.Request], httpx2.Response],
) -> OpenRouterProvider:
    client = httpx2.AsyncClient(transport=httpx2.MockTransport(handler))
    return OpenRouterProvider(
        client, SecretStr("test-key"), "google/gemma-4-26b-a4b-it"
    )


def sse(*lines: str) -> httpx2.Response:
    body = "".join(f"{line}\n" for line in lines)
    return httpx2.Response(
        200, content=body.encode(), headers={"content-type": "text/event-stream"}
    )


def chunk(text: str) -> str:
    return "data: " + json.dumps(
        {"choices": [{"index": 0, "delta": {"content": text}}]}
    )


async def collect(provider: OpenRouterProvider) -> list[str]:
    return [piece async for piece in provider.stream_reply(QUESTION)]


async def test_streams_the_text_pieces_and_skips_keep_alive_comments():
    sent: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        sent.append(request)
        return sse(
            ": OPENROUTER PROCESSING",
            "",
            chunk("Bumrah "),
            "",
            chunk("bowls yorkers."),
            "",
            "data: [DONE]",
            "",
        )

    pieces = await collect(provider_answering(handler))

    assert pieces == ["Bumrah ", "bowls yorkers."]
    [request] = sent
    assert request.url == "https://openrouter.ai/api/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer test-key"
    assert "http-referer" not in request.headers  # no app-attribution headers
    body = json.loads(request.content)
    assert body["model"] == "google/gemma-4-26b-a4b-it"
    assert body["stream"] is True
    assert body["messages"] == QUESTION


async def test_an_http_error_before_the_stream_raises_its_code():
    def handler(request: httpx2.Request) -> httpx2.Response:
        error = {"error": {"code": 429, "message": "Rate limit exceeded"}}
        return httpx2.Response(429, json=error)

    with pytest.raises(ProviderError) as raised:
        await collect(provider_answering(handler))

    assert raised.value.code == 429
    assert raised.value.detail == "Rate limit exceeded"


async def test_an_error_chunk_mid_stream_raises_after_the_text_so_far():
    error_chunk = {
        "error": {"code": 502, "message": "Provider disconnected unexpectedly"},
        "choices": [{"index": 0, "delta": {"content": ""}, "finish_reason": "error"}],
    }

    def handler(request: httpx2.Request) -> httpx2.Response:
        return sse(chunk("Use a deep point "), "", "data: " + json.dumps(error_chunk))

    provider = provider_answering(handler)
    pieces = []
    with pytest.raises(ProviderError) as raised:
        async for piece in provider.stream_reply(QUESTION):
            pieces.append(piece)

    assert pieces == ["Use a deep point "]
    assert raised.value.code == 502


@pytest.mark.parametrize(
    ("failure", "code"),
    [
        (httpx2.ReadTimeout("no data for 30 s"), 408),
        (httpx2.ConnectError("connection refused"), 502),
    ],
)
async def test_network_failures_become_provider_errors(failure, code):
    def handler(request: httpx2.Request) -> httpx2.Response:
        raise failure

    with pytest.raises(ProviderError) as raised:
        await collect(provider_answering(handler))

    assert raised.value.code == code


def tool_delta(index: int, arguments: str, **first: str) -> str:
    """A chunk with a piece of a tool call (OpenAI-style streamed tool calls).

    The first chunk of a call carries its id and name; later chunks only
    carry more of the JSON arguments.
    """
    call: dict = {"index": index, "function": {"arguments": arguments}}
    if first:
        call |= {"id": first["id"], "type": "function"}
        call["function"]["name"] = first["name"]
    return "data: " + json.dumps(
        {"choices": [{"index": 0, "delta": {"tool_calls": [call]}}]}
    )


async def test_a_streamed_tool_call_is_joined_and_yielded_after_the_text():
    sent: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        sent.append(request)
        return sse(
            chunk("Here is the field. "),
            tool_delta(0, '{"format": ', id="call_1", name="show_field_placement"),
            tool_delta(0, '"T20"}'),
            'data: {"choices": [{"index": 0, "delta": {}, '
            '"finish_reason": "tool_calls"}]}',
            "data: [DONE]",
        )

    tool = {"type": "function", "function": {"name": "show_field_placement"}}
    provider = provider_answering(handler)
    pieces = [p async for p in provider.stream_reply(QUESTION, [tool], "none")]

    assert pieces == [
        "Here is the field. ",
        ToolCall("call_1", "show_field_placement", '{"format": "T20"}'),
    ]
    body = json.loads(sent[0].content)
    assert body["tools"] == [tool]
    assert body["tool_choice"] == "none"


async def test_without_tools_the_request_has_no_tool_fields():
    sent: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        sent.append(request)
        return sse(chunk("OK."), "data: [DONE]")

    await collect(provider_answering(handler))

    body = json.loads(sent[0].content)
    assert "tools" not in body and "tool_choice" not in body
