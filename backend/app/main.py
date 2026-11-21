from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.config import SettingsDep

app = FastAPI(title="Sports Insight Bot API")


class Health(BaseModel):
    status: Literal["ok"]
    model: str


@app.get("/api/health")
def health(settings: SettingsDep) -> Health:
    return Health(status="ok", model=settings.openrouter_model)
