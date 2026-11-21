from collections.abc import AsyncIterable, AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Literal

import httpx2
from fastapi import Depends, FastAPI, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel, Field

from app.analyst import ChatMessage, SportFocus, stream_reply
from app.config import SettingsDep
from app.input_guard import check_request
from app.model_provider import ModelProvider
from app.openrouter import OpenRouterProvider


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # One HTTP client for the app's whole life. A warm Vercel instance then
    # reuses its open connection to OpenRouter (no new TLS handshake per chat).
    timeout = httpx2.Timeout(30.0, connect=5.0)
    async with httpx2.AsyncClient(timeout=timeout) as client:
        app.state.http_client = client
        yield


app = FastAPI(title="Sports Insight Bot API", lifespan=lifespan)


class Health(BaseModel):
    status: Literal["ok"]
    model: str


@app.get("/api/health")
def health(settings: SettingsDep) -> Health:
    return Health(status="ok", model=settings.openrouter_model)


class ChatRequest(BaseModel):
    """The recent Messages of one Chat, oldest first, ending with the Visitor's."""

    messages: Annotated[list[ChatMessage], Field(min_length=1)]
    sport_focus: SportFocus = Field(default_factory=SportFocus)


# Vercel refuses request bodies over 4.5 MB with HTTP 413 before our code runs.
# The same limit here makes local runs answer the same way. The page turns a 413
# into a clear message (chat-stream.ts), because on Vercel no code of ours can.
MAX_CHAT_BODY_BYTES = 4_500_000


def get_model_provider(request: Request, settings: SettingsDep) -> ModelProvider:
    return OpenRouterProvider(
        client=request.app.state.http_client,
        api_key=settings.openrouter_api_key,
        model=settings.openrouter_model,
    )


ModelProviderDep = Annotated[ModelProvider, Depends(get_model_provider)]


@app.post(
    "/api/chat",
    response_class=EventSourceResponse,
    max_body_size=MAX_CHAT_BODY_BYTES,
)
async def chat(
    chat_request: ChatRequest, provider: ModelProviderDep
) -> AsyncIterable[ServerSentEvent]:
    if refused := check_request(chat_request.messages):
        yield ServerSentEvent(
            event=refused.type, data=refused.model_dump(exclude={"type"})
        )
        return
    events = stream_reply(chat_request.messages, provider, chat_request.sport_focus)
    async for event in events:
        yield ServerSentEvent(event=event.type, data=event.model_dump(exclude={"type"}))
