from collections.abc import AsyncIterable, AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Literal

import httpx2
from fastapi import Depends, FastAPI, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel, Field

from app.analyst import ChatMessage, stream_reply
from app.config import SettingsDep
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
    max_body_size=512 * 1024,  # 20 Messages, Analyst replies included, fit easily
)
async def chat(
    chat_request: ChatRequest, provider: ModelProviderDep
) -> AsyncIterable[ServerSentEvent]:
    async for event in stream_reply(chat_request.messages, provider):
        yield ServerSentEvent(event=event.type, data=event.model_dump(exclude={"type"}))
